import { createAdminClient } from "@/lib/supabase/admin";

export const CHAT_HISTORY_LIMIT = 10;

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

/** Latest N messages in chronological order (oldest → newest). */
export async function getRecentChatHistory(
  conversationId: string,
  limit = CHAT_HISTORY_LIMIT
): Promise<ChatHistoryMessage[]> {
  const supabase = createAdminClient();

  const { data: rows } = await supabase
    .from("whatsapp_messages")
    .select("direction, content")
    .eq("conversation_id", conversationId)
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
