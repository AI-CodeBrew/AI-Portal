import { createAdminClient } from "@/lib/supabase/admin";
import { extractOutboundMedia } from "@/lib/ai/message-markers";
import {
  getStoreWhatsAppCredentials,
  normalizePhone,
  sendWhatsAppImage,
  sendWhatsAppText,
} from "@/lib/whatsapp";
import { getWindowStatus } from "@/lib/whatsapp-window/window-status";
import type { WindowType } from "@/lib/whatsapp-window/window-status";

export async function sendWhatsAppOutboundMessage(params: {
  conversationId: string;
  customerPhone: string;
  store: {
    whatsapp_phone_number_id: string | null;
    whatsapp_access_token: string | null;
  };
  content: string;
  lastCustomerMessageAt: string | null;
  windowType: WindowType | null;
}): Promise<{ ok: true } | { ok: false; error: string; windowClosed?: boolean }> {
  const windowStatus = getWindowStatus(
    params.lastCustomerMessageAt,
    params.windowType ?? "service"
  );

  if (!windowStatus.isOpen) {
    return {
      ok: false,
      windowClosed: true,
      error:
        "The messaging window has closed. Use an approved WhatsApp template instead.",
    };
  }

  const waCreds = getStoreWhatsAppCredentials(params.store);
  if (!waCreds) {
    return {
      ok: false,
      error:
        "WhatsApp is not connected or the access token could not be decrypted. Reconnect WhatsApp in Integrations.",
    };
  }

  const to = normalizePhone(params.customerPhone);
  if (!to || to.length < 8) {
    return {
      ok: false,
      error: `Invalid customer phone number: ${params.customerPhone}`,
    };
  }

  const { text, imageUrls } = extractOutboundMedia(params.content);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let metaMessageId: string | null = null;
  try {
    let imagesSent = 0;
    for (const imageUrl of imageUrls.slice(0, 3)) {
      try {
        const imgResult = await sendWhatsAppImage({
          phoneNumberId: waCreds.phoneNumberId,
          accessToken: waCreds.accessToken,
          to,
          imageUrl,
        });
        metaMessageId = imgResult.id;
        imagesSent += 1;
        await sleep(1500);
      } catch (imgErr) {
        console.error("[inbox/outbound] image send failed:", imgErr);
      }
    }

    if (text.trim()) {
      if (imagesSent > 0) await sleep(500);
      const textResult = await sendWhatsAppText({
        phoneNumberId: waCreds.phoneNumberId,
        accessToken: waCreds.accessToken,
        to,
        text,
      });
      metaMessageId = textResult.id;
    }
  } catch (sendErr) {
    const detail =
      sendErr instanceof Error ? sendErr.message : "WhatsApp send failed";
    return {
      ok: false,
      error: `Could not deliver message to WhatsApp. Details: ${detail}`,
    };
  }

  const supabase = createAdminClient();
  const { error: insertError } = await supabase.from("whatsapp_messages").insert({
    conversation_id: params.conversationId,
    direction: "out",
    content: params.content,
    meta_message_id: metaMessageId,
    status: metaMessageId ? "sent" : null,
  });

  if (insertError) {
    console.error("[inbox/outbound] DB insert failed after send:", insertError.message);
    return {
      ok: false,
      error:
        "Message was sent on WhatsApp but failed to save in the portal. Refresh and check the chat.",
    };
  }

  await supabase
    .from("whatsapp_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.conversationId);

  return { ok: true };
}
