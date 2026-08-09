import { getRecentChatHistory } from "@/lib/ai/chat-history";
import { detectConversationStage } from "@/lib/ai/conversation-stage";
import { parseCheckoutDetails } from "@/lib/ai/checkout-parse";
import { looksLikeOrderDecline } from "@/lib/ai/sales-recovery";
import { extractSkuFromText } from "@/lib/products/products-service";
import { loadConversationSummary } from "./conversation-compaction";
import {
  loadCustomerSalesProfile,
  mergeCustomerSalesProfile,
} from "./customer-profile";
import { recallMemories } from "./mem0-client";
import { buildSalesSessionKey, isMemoryEnabled } from "./session-key";
import { MEMORY_DEFAULTS, type AgentMemoryContext } from "./types";

/**
 * Load memory layers for one turn.
 * Returns profile + rolling summary + Mem0 recall.
 * Verbatim history is resolved separately via `resolveAgentChatHistory`
 * (full thread until ~70% budget, then summary + last 20).
 */
export async function buildAgentMemoryContext(params: {
  storeId: string;
  customerPhone: string;
  conversationId: string;
  sinceIso?: string | null;
  latestUserMessage?: string | null;
  /** From resolveAgentChatHistory — 0 = full thread fits */
  storeHistoryLimit?: number | null;
  rollingSummaryOverride?: string | null;
}): Promise<AgentMemoryContext> {
  const {
    storeId,
    customerPhone,
    conversationId,
    latestUserMessage,
  } = params;

  const sessionKey = buildSalesSessionKey(storeId, customerPhone);
  const historyLimit =
    params.storeHistoryLimit === 0
      ? 0
      : params.storeHistoryLimit ?? MEMORY_DEFAULTS.recent_turn_limit;

  const [profileData, summaryRow] = await Promise.all([
    loadCustomerSalesProfile(storeId, customerPhone),
    loadConversationSummary(conversationId),
  ]);

  let recalled: AgentMemoryContext["recalledMemories"] = [];
  if (
    isMemoryEnabled() &&
    latestUserMessage &&
    latestUserMessage.trim()
  ) {
    recalled = await recallMemories(sessionKey, latestUserMessage, 5);
  }

  const rollingSummary =
    params.rollingSummaryOverride !== undefined
      ? params.rollingSummaryOverride
      : summaryRow.rollingSummary;

  return {
    sessionKey,
    rollingSummary,
    summaryUpdatedAt: summaryRow.summaryUpdatedAt,
    profile: profileData.profile,
    funnelStage: profileData.funnelStage,
    language: profileData.language,
    recalledMemories: recalled,
    historyLimit,
  };
}

/**
 * Rules-first profile update after each turn.
 * No LLM extract every message — cheap heuristics only.
 */
export async function updateProfileFromTurn(params: {
  storeId: string;
  customerPhone: string;
  userMessage: string;
  assistantReply: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<void> {
  const { storeId, customerPhone, userMessage, assistantReply, history } =
    params;

  const stage = detectConversationStage(history);
  const checkout = parseCheckoutDetails(userMessage);
  const sku = extractSkuFromText(userMessage);

  const patch: Parameters<typeof mergeCustomerSalesProfile>[2] = {
    funnel_stage: stage,
  };

  if (checkout?.customer_name) patch.name = checkout.customer_name;
  if (checkout?.city) {
    patch.agent_notes = `City: ${checkout.city}`;
  }

  if (/[\u0600-\u06FF]/.test(userMessage)) {
    patch.language = "ar";
  } else if (/[a-zA-Z]/.test(userMessage)) {
    patch.language = "en";
  }

  if (sku) {
    patch.interested_skus = [sku];
  }

  if (looksLikeOrderDecline(userMessage)) {
    patch.objections = ["price_or_decline"];
  }

  // Capture product interest from assistant pitch markers lightly
  const productMatch = assistantReply.match(
    /(?:product|item)\s*[:\-]?\s*([^\n.]{3,60})/i
  );
  if (productMatch?.[1]) {
    patch.interested_products = [productMatch[1].trim()];
  }

  await mergeCustomerSalesProfile(storeId, customerPhone, patch);
}

/** Lightweight recent history for profile stage detection (not for agent contents). */
export async function loadRecentForProfile(
  conversationId: string,
  sinceIso?: string | null
) {
  return getRecentChatHistory(
    conversationId,
    MEMORY_DEFAULTS.recent_turn_limit,
    0,
    sinceIso
  );
}
