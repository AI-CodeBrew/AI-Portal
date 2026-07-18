import { createAdminClient } from "@/lib/supabase/admin";
import {
  AI_SETTING_DEFAULTS,
  isUnlimitedChatHistory,
  isUnlimitedSessionWindow,
  MAX_UNLIMITED_HISTORY_MESSAGES,
} from "./ai-settings-types";

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
 * Latest messages for AI context, chronological (oldest → newest).
 * limit/windowMs of 0 = unlimited (up to MAX_UNLIMITED_HISTORY_MESSAGES).
 */
export async function getRecentChatHistory(
  conversationId: string,
  limit = CHAT_HISTORY_LIMIT,
  windowMs = AI_SESSION_WINDOW_MS,
  sinceIso?: string | null
): Promise<ChatHistoryMessage[]> {
  const supabase = createAdminClient();
  const unlimitedHistory = isUnlimitedChatHistory(limit);
  const unlimitedWindow = windowMs === 0;

  let query = supabase
    .from("whatsapp_messages")
    .select("direction, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });

  if (sinceIso) {
    query = query.gte("created_at", sinceIso);
  }

  if (!unlimitedWindow && windowMs > 0) {
    const since = new Date(Date.now() - windowMs).toISOString();
    query = query.gte("created_at", since);
  }

  query = query.limit(
    unlimitedHistory ? MAX_UNLIMITED_HISTORY_MESSAGES : Math.max(1, limit)
  );

  const { data: rows } = await query;

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
    windowMs: isUnlimitedSessionWindow(windowHours)
      ? 0
      : windowHours * 60 * 60 * 1000,
  };
}

/** Trim history for LLM calls — no-op when unlimited. */
export function trimHistoryForAgent(
  history: ChatHistoryMessage[],
  limit: number
): ChatHistoryMessage[] {
  if (isUnlimitedChatHistory(limit)) return history;
  return history.slice(-Math.max(1, limit));
}
