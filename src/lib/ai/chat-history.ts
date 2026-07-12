import { createAdminClient } from "@/lib/supabase/admin";

export const CHAT_HISTORY_LIMIT = 10;

/** AI only sees messages from this rolling window; inbox keeps full history. */
export const AI_SESSION_WINDOW_MS = 2 * 60 * 60 * 1000;
export const AI_SESSION_WINDOW_HOURS = 2;

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Latest N messages within the AI session window (default 2 hours),
 * chronological (oldest → newest).
 * Older messages remain in the inbox until the reseller deletes the chat.
 */
export async function getRecentChatHistory(
  conversationId: string,
  limit = CHAT_HISTORY_LIMIT,
  windowMs = AI_SESSION_WINDOW_MS
): Promise<ChatHistoryMessage[]> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - windowMs).toISOString();

  const { data: rows } = await supabase
    .from("whatsapp_messages")
    .select("direction, content, created_at")
    .eq("conversation_id", conversationId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (rows ?? [])
    .reverse()
    .map((m) => ({
      role: (m.direction === "in" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: m.content,
    }));
}
