import { transcribeVoiceNote } from "@/lib/ai/transcribe-audio";
import { downloadWhatsAppMedia } from "@/lib/whatsapp/download-media";
import { inboundMessagePreview } from "@/lib/whatsapp-window/conversation-window";
import { getStoreWhatsAppCredentials } from "@/lib/whatsapp";

export type InboundWhatsAppMessage = {
  type: string;
  text?: { body: string };
  audio?: { id: string; mime_type?: string; voice?: boolean };
};

type StoreForWhatsApp = {
  whatsapp_phone_number_id: string | null;
  whatsapp_access_token: string | null;
};

export async function resolveInboundText(
  msg: InboundWhatsAppMessage,
  store: StoreForWhatsApp
): Promise<{ text: string | null; preview: string }> {
  if (msg.type === "text" && msg.text?.body?.trim()) {
    const text = msg.text.body.trim();
    return { text, preview: text };
  }

  if (msg.type === "audio" && msg.audio?.id) {
    const waCreds = getStoreWhatsAppCredentials(store);
    if (!waCreds) {
      return { text: null, preview: "[audio]" };
    }

    try {
      const media = await downloadWhatsAppMedia(
        msg.audio.id,
        waCreds.accessToken
      );
      const transcript = await transcribeVoiceNote(
        media.buffer,
        media.mimeType || msg.audio.mime_type || "audio/ogg"
      );
      if (transcript) {
        return { text: transcript, preview: `[audio] ${transcript}` };
      }
    } catch (err) {
      console.error("[whatsapp-webhook] voice note handling failed:", err);
    }

    return { text: null, preview: "[audio]" };
  }

  return {
    text: null,
    preview: inboundMessagePreview(msg.type, msg.text?.body),
  };
}
