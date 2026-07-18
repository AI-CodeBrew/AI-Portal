import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

/** Mark that this customer's AI chat was cleared from the inbox — next thread is fresh. */
export async function markAiSessionReset(
  storeId: string,
  customerPhone: string
): Promise<void> {
  const phone = normalizePhone(customerPhone);
  if (!phone) return;

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase.from("whatsapp_ai_session_resets").upsert(
    {
      store_id: storeId,
      customer_phone: phone,
      reset_at: now,
    },
    { onConflict: "store_id,customer_phone" }
  );

  if (error) {
    throw new Error(error.message);
  }
}

/** Latest inbox clear time for this customer, if any. */
export async function getAiSessionResetAt(
  storeId: string,
  customerPhone: string
): Promise<string | null> {
  const phone = normalizePhone(customerPhone);
  if (!phone) return null;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("whatsapp_ai_session_resets")
    .select("reset_at")
    .eq("store_id", storeId)
    .eq("customer_phone", phone)
    .maybeSingle();

  return (data?.reset_at as string | null) ?? null;
}

/** Close any still-open conversations for this customer so the next inbound starts clean. */
export async function closeOpenConversationsForPhone(
  storeId: string,
  customerPhone: string,
  exceptConversationId?: string
): Promise<void> {
  const phone = normalizePhone(customerPhone);
  if (!phone) return;

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  let query = supabase
    .from("whatsapp_conversations")
    .update({ status: "closed", updated_at: now })
    .eq("store_id", storeId)
    .eq("customer_phone", phone)
    .neq("status", "closed");

  if (exceptConversationId) {
    query = query.neq("id", exceptConversationId);
  }

  const { error } = await query;
  if (error) {
    throw new Error(error.message);
  }
}

/** Only load AI history from this timestamp onward (after inbox clear or conv start). */
export function resolveAiContextSinceIso(
  conversationCreatedAt: string,
  sessionResetAt: string | null
): string {
  if (!sessionResetAt) return conversationCreatedAt;
  return new Date(sessionResetAt) > new Date(conversationCreatedAt)
    ? sessionResetAt
    : conversationCreatedAt;
}
