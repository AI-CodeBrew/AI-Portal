import { runSalesAgentWithGroq } from "./groq-agent";
import { runSalesAgentWithGemini } from "./gemini-agent";
import { runSalesAgentWithAnthropic } from "./anthropic-agent";
import { getShopCurrency } from "@/lib/shopify";
import { resolveStoreAiConfig } from "./store-ai-settings";
import {
  getActiveLlmConfig,
  isLlmProviderConfigured,
} from "@/lib/platform/llm-settings";
import {
  getPendingOrdersHintForPhone,
  type AgentContext,
} from "./sales-tools";
import { tryDirectProductReply, tryDirectProductImageReply, tryDirectVariantSelectionReply } from "./product-reply";
import { tryDirectCheckoutReply } from "./checkout-reply";
import {
  tryDirectSalesRecoveryReply,
  looksLikeOrderDecline,
  productOfferedInHistory,
} from "./sales-recovery";
import { tryDirectGreetingReply, tryDirectOffTopicReply, buildCasualGreetingReply } from "./greeting-reply";

export type { AgentContext } from "./sales-tools";

export async function isSalesAgentConfigured(): Promise<boolean> {
  return isLlmProviderConfigured();
}

async function enrichAgentContext(ctx: AgentContext): Promise<AgentContext> {
  let next = ctx;

  if (!ctx.storeCurrency && ctx.store.shop_domain && ctx.store.shopify_access_token) {
    try {
      const storeCurrency = await getShopCurrency(
        ctx.store.shop_domain,
        ctx.store.shopify_access_token
      );
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

  return next;
}

export async function runSalesAgent(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const enrichedCtx = await enrichAgentContext(ctx);
  const latestUser =
    [...history].reverse().find((m) => m.role === "user")?.content ?? "";

  // Place-order + name/phone/address → create & confirm before the LLM
  try {
    const checkout = await tryDirectCheckoutReply(
      enrichedCtx,
      latestUser,
      history
    );
    if (checkout) return checkout;
  } catch (err) {
    console.error("[run-sales-agent] checkout failed:", err);
  }

  // Decline after product pitch → discount, then bundle, then stop
  try {
    const recovery = await tryDirectSalesRecoveryReply(
      enrichedCtx,
      latestUser,
      history
    );
    if (recovery) return recovery;
  } catch (err) {
    console.error("[run-sales-agent] sales recovery failed:", err);
  }

  // Casual hi / what's up — human greeting, not catalog lookup
  try {
    const greeting = tryDirectGreetingReply(enrichedCtx, latestUser);
    if (greeting) return greeting;
  } catch (err) {
    console.error("[run-sales-agent] greeting reply failed:", err);
  }

  // "Are you AI?", jokes, etc. — before catalog lookup
  try {
    const offTopic = tryDirectOffTopicReply(enrichedCtx, latestUser);
    if (offTopic) return offTopic;
  } catch (err) {
    console.error("[run-sales-agent] off-topic reply failed:", err);
  }

  // Catalog lookup by SKU or product name (incl. variants)
  try {
    const imageReply = await tryDirectProductImageReply(
      enrichedCtx,
      latestUser,
      history
    );
    if (imageReply) return imageReply;
  } catch (err) {
    console.error("[run-sales-agent] product image failed:", err);
  }

  try {
    const variantReply = await tryDirectVariantSelectionReply(
      enrichedCtx,
      latestUser,
      history
    );
    if (variantReply) return variantReply;
  } catch (err) {
    console.error("[run-sales-agent] variant selection failed:", err);
  }

  try {
    const direct = await tryDirectProductReply(enrichedCtx, latestUser, history);
    if (direct) return direct.reply;
  } catch (err) {
    console.error("[run-sales-agent] product prefetch failed:", err);
  }

  // Objection after a product pitch — recovery handler only (no LLM double-reply)
  if (
    productOfferedInHistory(history) &&
    looksLikeOrderDecline(latestUser)
  ) {
    console.log(
      "[run-sales-agent] objection after pitch — skipping LLM (recovery handles this path)"
    );
    return "Got it 👍 No pressure from my side — message anytime if you change your mind.";
  }

  const llm = await getActiveLlmConfig();

  if (llm.provider === "gemini") {
    if (!llm.geminiApiKey) {
      console.error(
        "[run-sales-agent] Gemini selected but API key unavailable (decrypt failed or not saved on this server)"
      );
    } else {
      try {
        return await runSalesAgentWithGemini(enrichedCtx, history, {
          apiKey: llm.geminiApiKey,
          model: llm.geminiModel,
        });
      } catch (err) {
        console.error("[run-sales-agent] Gemini agent error:", err);
        const greeting = tryDirectGreetingReply(enrichedCtx, latestUser);
        if (greeting) return greeting;
      }
    }
  }

  if (llm.provider === "groq" && llm.groqApiKey) {
    try {
      return await runSalesAgentWithGroq(enrichedCtx, history, {
        apiKey: llm.groqApiKey,
        model: llm.groqModel,
      });
    } catch (err) {
      console.error("[run-sales-agent] Groq agent error:", err);
      const greeting = tryDirectGreetingReply(enrichedCtx, latestUser);
      if (greeting) return greeting;
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return runSalesAgentWithAnthropic(enrichedCtx, history);
  }

  return buildCasualGreetingReply(enrichedCtx);
}
