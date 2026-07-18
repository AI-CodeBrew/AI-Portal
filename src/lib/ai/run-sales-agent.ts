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
import {
  tryDirectProductReply,
  tryDirectVariantSelectionReply,
  tryDirectCatalogBrowseReply,
} from "./product-reply";
import { tryDirectCheckoutReply } from "./checkout-reply";
import { tryDirectSalesRecoveryReply } from "./sales-recovery";
import {
  buildCasualGreetingReply,
  buildHowAreYouReply,
  tryDirectGreetingReply,
  tryDirectOffTopicReply,
} from "./greeting-reply";
import { resolveExactDirectRoute } from "./exact-routes";

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

/** Regex handlers only when resolveExactDirectRoute matches — else AI decides. */
async function tryExactDirectReply(
  ctx: AgentContext,
  latestUser: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  route: ReturnType<typeof resolveExactDirectRoute>
): Promise<string | null> {
  if (!route) return null;

  switch (route) {
    case "checkout": {
      return tryDirectCheckoutReply(ctx, latestUser, history);
    }
    case "catalog_browse":
    case "catalog_more": {
      return tryDirectCatalogBrowseReply(ctx, latestUser, history);
    }
    case "greeting_only": {
      return tryDirectGreetingReply(ctx, latestUser);
    }
    case "how_are_you": {
      return buildHowAreYouReply(ctx);
    }
    case "off_topic": {
      return tryDirectOffTopicReply(ctx, latestUser);
    }
    case "variant_selection": {
      return tryDirectVariantSelectionReply(ctx, latestUser, history);
    }
    case "sku_search":
    case "named_product_search": {
      const direct = await tryDirectProductReply(ctx, latestUser, history);
      return direct?.reply ?? null;
    }
    default:
      return null;
  }
}

export async function runSalesAgent(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const enrichedCtx = await enrichAgentContext({
    ...ctx,
    chatHistory: history,
  });
  const latestUser =
    [...history].reverse().find((m) => m.role === "user")?.content ?? "";

  const exactRoute = resolveExactDirectRoute(latestUser, history);

  try {
    const exact = await tryExactDirectReply(
      enrichedCtx,
      latestUser,
      history,
      exactRoute
    );
    if (exact) return exact;
  } catch (err) {
    console.error("[run-sales-agent] exact direct reply failed:", err);
  }

  // Recovery uses its own exact decline patterns + pitch detection
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
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return runSalesAgentWithAnthropic(enrichedCtx, history);
    } catch (err) {
      console.error("[run-sales-agent] Anthropic agent error:", err);
    }
  }

  return buildCasualGreetingReply(enrichedCtx);
}
