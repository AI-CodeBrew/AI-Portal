import {
  resolveGeminiChatModel,
  resolveGeminiReasoningModel,
} from "@/lib/platform/llm-settings";
import { detectConversationStage } from "./conversation-stage";
import { looksLikeOrderDecline } from "./sales-recovery";

type HistoryMessage = { role: "user" | "assistant"; content: string };

const HARD_NEGOTIATION =
  /\b(too\s+expensive|expensive|costly|cost\s+is\s+high|price\s+is\s+high|discount|cheaper|negotiate|best\s+price|last\s+price|final\s+price|offer|bundle|deal|%\s*off|bulk|sasta|غالي|خصم|سعر)\b/i;

/**
 * Chat = gemini-3.6-flash (default).
 * Hard negotiation / objection = gemini-3.1-pro-preview.
 */
export function selectSalesModel(params: {
  history: HistoryMessage[];
  latestUser: string;
}): string {
  const stage = detectConversationStage(params.history);
  const text = params.latestUser.trim();

  const hard =
    stage === "objection_handling" ||
    looksLikeOrderDecline(text) ||
    HARD_NEGOTIATION.test(text);

  if (hard) {
    return resolveGeminiReasoningModel();
  }
  return resolveGeminiChatModel();
}

/** Thinking config for Flash. Disabled — thinkingBudget: 0 on gemini-3.6-flash returns 400 INVALID_ARGUMENT. */
export function chatThinkingConfig(_model: string): Record<string, unknown> | null {
  return null;
}
