import { normalizePhone } from "@/lib/phone";

const GRAPH_API = "https://graph.facebook.com/v21.0";

export type RichTemplateSendInput = {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
  headerImageUrl?: string | null;
  buttonUrlPath?: string | null;
  buttonIndex?: number;
};

export function buildRichTemplateComponents(input: {
  bodyParams?: string[];
  headerImageUrl?: string | null;
  buttonUrlPath?: string | null;
  buttonIndex?: number;
}): Array<Record<string, unknown>> | undefined {
  const components: Array<Record<string, unknown>> = [];

  if (input.headerImageUrl?.trim()) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: { link: input.headerImageUrl.trim() },
        },
      ],
    });
  }

  if (input.bodyParams && input.bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: input.bodyParams.map((text) => ({
        type: "text",
        text,
      })),
    });
  }

  if (input.buttonUrlPath?.trim()) {
    components.push({
      type: "button",
      sub_type: "url",
      index: String(input.buttonIndex ?? 0),
      parameters: [
        {
          type: "text",
          text: input.buttonUrlPath.trim().slice(0, 2000),
        },
      ],
    });
  }

  return components.length > 0 ? components : undefined;
}

export async function sendRichWhatsAppTemplate(
  input: RichTemplateSendInput
): Promise<void> {
  const components = buildRichTemplateComponents({
    bodyParams: input.bodyParams,
    headerImageUrl: input.headerImageUrl,
    buttonUrlPath: input.buttonUrlPath,
    buttonIndex: input.buttonIndex,
  });

  const res = await fetch(`${GRAPH_API}/${input.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(input.to),
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode ?? "en" },
        ...(components ? { components } : {}),
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`WhatsApp template send failed: ${await res.text()}`);
  }
}
