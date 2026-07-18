import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildTemplateBodyParams,
  resolveTemplateRichSendOptions,
  type TemplateContext,
} from "@/lib/whatsapp-window/template-params";
import { sendRichWhatsAppTemplate } from "@/lib/whatsapp/rich-template-send";
import {
  getStoreWhatsAppCredentials,
  normalizePhone,
} from "@/lib/whatsapp";
import type { Store } from "@/lib/types";

export type SendConversationTemplateInput = {
  storeId: string;
  store: Pick<
    Store,
    "whatsapp_phone_number_id" | "whatsapp_access_token"
  >;
  conversationId: string;
  customerPhone: string;
  template: {
    name: string;
    language: string;
    body_text: string;
    header_format?: string | null;
    button_type?: string | null;
    button_url_pattern?: string | null;
  };
  context: TemplateContext;
};

export async function sendConversationTemplateMessage(
  input: SendConversationTemplateInput
): Promise<
  | { ok: true; to: string; preview: string; bodyParams: string[] }
  | { ok: false; error: string }
> {
  const waCreds = getStoreWhatsAppCredentials(input.store);
  if (!waCreds) {
    return {
      ok: false,
      error:
        "WhatsApp is not connected or the access token could not be decrypted.",
    };
  }

  const to = normalizePhone(input.customerPhone);
  if (!to || to.length < 8) {
    return { ok: false, error: `Invalid customer phone: ${input.customerPhone}` };
  }

  const bodyParams = buildTemplateBodyParams(
    input.template.body_text,
    input.context
  );
  const rich = resolveTemplateRichSendOptions(input.template, input.context);

  if (input.template.header_format === "IMAGE" && !rich.headerImageUrl) {
    return {
      ok: false,
      error:
        "This template needs a product image. Select a product with an image before sending.",
    };
  }

  if (input.template.button_type === "URL" && !rich.buttonUrlPath) {
    return {
      ok: false,
      error:
        "This template needs a product link. Select a product that has a Shopify URL.",
    };
  }

  try {
    await sendRichWhatsAppTemplate({
      phoneNumberId: waCreds.phoneNumberId,
      accessToken: waCreds.accessToken,
      to,
      templateName: input.template.name,
      languageCode: input.template.language || "en",
      bodyParams,
      headerImageUrl: rich.headerImageUrl,
      buttonUrlPath: rich.buttonUrlPath,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "WhatsApp template send failed",
    };
  }

  const previewParts = [
    rich.headerImageUrl ? `[Image: ${rich.headerImageUrl}]` : null,
    input.template.body_text.replace(/\{\{(\d+)\}\}/g, (_, n: string) => {
      const idx = Number(n) - 1;
      return bodyParams[idx] ?? "";
    }),
    rich.buttonUrlPath ? `Button → ${rich.buttonUrlPath}` : null,
  ].filter(Boolean);

  const supabase = createAdminClient();
  await supabase.from("whatsapp_messages").insert({
    conversation_id: input.conversationId,
    direction: "out",
    content: previewParts.join("\n"),
  });

  await supabase
    .from("whatsapp_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.conversationId);

  return {
    ok: true,
    to,
    preview: previewParts.join("\n"),
    bodyParams,
  };
}
