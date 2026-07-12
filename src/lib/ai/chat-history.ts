import { createAdminClient } from "@/lib/supabase/admin";
import { AI_SETTING_DEFAULTS } from "./ai-settings-types";

export const CHAT_HISTORY_LIMIT: number = AI_SETTING_DEFAULTS.chatHistoryLimit;

/** AI only sees messages from this rolling window; inbox keeps full history. */
export const AI_SESSION_WINDOW_MS: number =
  AI_SETTING_DEFAULTS.sessionWindowHours * 60 * 60 * 1000;
export const AI_SESSION_WINDOW_HOURS: number =
  AI_SETTING_DEFAULTS.sessionWindowHours;

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Latest N messages within the AI session window,
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

/** Resolve chat context limits for a store (reseller override → admin default). */
export async function getStoreChatContextLimits(storeId: string): Promise<{
  historyLimit: number;
  windowHours: number;
  windowMs: number;
}> {
  const { resolveStoreAiConfig } = await import("./store-ai-settings");
  const config = await resolveStoreAiConfig(storeId);
  const historyLimit = config.effectiveChatHistoryLimit;
  const windowHours = config.effectiveSessionWindowHours;
  return {
    historyLimit,
    windowHours,
    windowMs: windowHours * 60 * 60 * 1000,
  };
}
