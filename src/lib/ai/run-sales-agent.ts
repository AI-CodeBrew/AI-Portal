import { runSalesAgentWithGemini } from "./gemini-agent";
import { getEffectiveStoreCurrency } from "@/lib/currency";
import { resolveStoreAiConfig } from "./store-ai-settings";
import {
  getActiveLlmConfig,
  isLlmProviderConfigured,
} from "@/lib/platform/llm-settings";
import { getPendingOrdersHintForPhone, type AgentContext } from "./sales-tools";
import { looksLikeObjection } from "./sales-recovery";
import { findMatchingRebuttal } from "@/lib/rebuttals/rebuttals-service";

export type { AgentContext } from "./sales-tools";

export async function isSalesAgentConfigured(): Promise<boolean> {
  return isLlmProviderConfigured();
}

async function enrichAgentContext(ctx: AgentContext): Promise<AgentContext> {
  let next = ctx;

  if (!ctx.storeCurrency) {
    try {
      const storeCurrency = await getEffectiveStoreCurrency(ctx.store.id);
      next = { ...next, storeCurrency };
    } catch {
      // keep without currency
    }
  }

  if (!ctx.aiConfig) {
    try {
      const aiConfig = await resolveStoreAiConfig(ctx.store.id);
      next = { ...next, aiConfig };
    } catch (err) {
      console.error("[run-sales-agent] AI config load failed:", err);
    }
  }

  if (next.pendingOrdersHint == null) {
    try {
      const pendingOrdersHint = await getPendingOrdersHintForPhone(
        next.store.id,
        next.customerPhone
      );
      next = { ...next, pendingOrdersHint };
    } catch (err) {
      console.error("[run-sales-agent] pending orders hint failed:", err);
    }
  }

  // Gate on the objection regex: without it every greeting/address/"yes" pays
  // an embedding round trip for near-zero hit rate.
  if (next.rebuttal === undefined) {
    const latestUser =
      [...(next.chatHistory ?? [])]
        .reverse()
        .find((m) => m.role === "user")?.content ?? "";

    if (latestUser && looksLikeObjection(latestUser)) {
      try {
        next = {
          ...next,
          rebuttal: await findMatchingRebuttal(next.store.id, latestUser),
        };
      } catch (err) {
        console.warn("[run-sales-agent] rebuttal lookup failed:", err);
      }
    }
  }

  return next;
}

/**
 * user -> LLM router -> function -> function result -> LLM -> user.
 * No regex intent detection here — the LLM alone decides intent and which
 * tool to call (or responds in plain text / asks for clarification). See
 * build-system-prompt.ts's WHEN UNSURE section for the clarification rule.
 */
export async function runSalesAgent(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const enrichedCtx = await enrichAgentContext({
    ...ctx,
    chatHistory: history,
  });

  const llm = await getActiveLlmConfig();

  if (llm.geminiApiKey) {
    try {
      return await runSalesAgentWithGemini(enrichedCtx, history, {
        apiKey: llm.geminiApiKey,
      });
    } catch (err) {
      console.error("[run-sales-agent] Gemini agent error:", err);
    }
  } else {
    console.error(
      "[run-sales-agent] Gemini API key unavailable (set GEMINI_API_KEY in env)"
    );
  }

  return "Sorry, I'm having a bit of trouble — a team member will jump in shortly.";
}
