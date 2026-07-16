import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/**
 * Claim this Meta webhook delivery before any AI work.
 * Returns false if this wamid was already processed (retry / race).
 */
export async function claimWhatsappWebhookDelivery(
  supabase: SupabaseAdmin,
  wamid: string | undefined
): Promise<boolean> {
  if (!wamid?.trim()) return true;

  const { error } = await supabase
    .from("whatsapp_webhook_dedup")
    .insert({ wamid: wamid.trim() });

  if (!error) return true;
  if (error.code === "23505") return false;

  const missingTable =
    error.code === "PGRST204" ||
    error.code === "42P01" ||
    /whatsapp_webhook_dedup/.test(error.message);

  if (missingTable) {
    console.warn(
      "[whatsapp-webhook] whatsapp_webhook_dedup missing — run migration 030_whatsapp_webhook_dedup.sql"
    );
    return true;
  }

  console.error("[whatsapp-webhook] dedup claim failed:", error);
  return true;
}

/** Persist inbound WhatsApp text; dedupe by wamid when migration 028 is applied. */
export async function recordInboundWhatsappMessage(
  supabase: SupabaseAdmin,
  params: {
    conversationId: string;
    content: string;
    metaMessageId?: string;
  }
): Promise<"inserted" | "duplicate" | "failed"> {
  const base = {
    conversation_id: params.conversationId,
    direction: "in" as const,
    content: params.content,
  };

  if (params.metaMessageId) {
    const withMeta = await supabase.from("whatsapp_messages").insert({
      ...base,
      meta_message_id: params.metaMessageId,
    });

    if (!withMeta.error) return "inserted";
    if (withMeta.error.code === "23505") return "duplicate";

    const missingColumn =
      withMeta.error.code === "PGRST204" ||
      /meta_message_id/.test(withMeta.error.message);

    if (!missingColumn) {
      console.error(
        "[whatsapp-webhook] inbound insert failed:",
        withMeta.error
      );
      return "failed";
    }

    console.warn(
      "[whatsapp-webhook] meta_message_id column missing — run migration 028_whatsapp_message_dedup.sql"
    );
  }

  const plain = await supabase.from("whatsapp_messages").insert(base);
  if (!plain.error) return "inserted";
  if (plain.error.code === "23505") return "duplicate";

  console.error("[whatsapp-webhook] inbound insert failed:", plain.error);
  return "failed";
}
