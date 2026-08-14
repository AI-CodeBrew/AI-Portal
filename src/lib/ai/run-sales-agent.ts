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
  tryDirectCatalogProductPickReply,
  tryDirectProductConfirmReply,
} from "./product-reply";
import { tryDirectCheckoutReply } from "./checkout-reply";
import {
  tryDirectSalesRecoveryReply,
  looksLikeOrderDecline,
} from "./sales-recovery";
import {
  buildCasualGreetingReply,
  buildHowAreYouReply,
  buildWaitingForQuestionReply,
  buildHumanHandoffReply,
  looksLikeCasualGreeting,
  looksLikeHowAreYou,
  looksLikeOffTopicChat,
  looksLikeHumanHandoffRequest,
  assistantAlreadyWelcomed,
  tryDirectGreetingReply,
  tryDirectOffTopicReply,
} from "./greeting-reply";
import { resolveExactDirectRoute, looksLikeExactNamedProductQuery } from "./exact-routes";
import {
  catalogBrowseActiveInHistory,
  looksLikeRomanUrduProductAsk,
} from "@/lib/products/products-service";
import { looksLikeCheckoutMessage } from "./checkout-parse";
import {
  looksLikeVariantSelection,
  formatVariantOptionReprompt,
} from "./variant-selection";
import { tryIntentRoutedReply } from "./intent-router";
import { tryDirectPolicyReply } from "./policy-reply";
import { executeSalesTool } from "./sales-tools";
import { findActiveProductContext } from "./product-reply";

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

function looksLikeMemoryProductAsk(text: string): boolean {
  return /\b(what (product )?(was|were|did) i|was i (interested|looking)|looking at before|interested in)\b/i.test(
    text
  );
}

function isPlausibleProductLabel(t: string | null | undefined): t is string {
  if (!t) return false;
  const s = t.trim();
  if (s.length < 4 || s.length > 80) return false;
  if (
    /^(who|what|when|where|why|how|human|talk|please|product)$/i.test(s)
  ) {
    return false;
  }
  if (
    /show you|help you|product you want|tell me|ask me|locking in|couldn'?t find/i.test(
      s
    )
  ) {
    return false;
  }
  return /[a-zA-Z]{3,}/.test(s);
}

function recallPitchedProductReply(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  latestUser: string
): string | null {
  if (!looksLikeMemoryProductAsk(latestUser)) return null;

  const fromChat = findActiveProductContext(history, latestUser)?.title;
  const products = ctx.memoryContext?.profile?.interested_products ?? [];
  const fromProfile = products.find((p) => isPlausibleProductLabel(p));
  let label = isPlausibleProductLabel(fromChat) ? fromChat : fromProfile ?? null;

  if (!label) {
    for (const m of ctx.memoryContext?.recalledMemories ?? []) {
      const audionic = m.memory.match(/\bAudionic ENC(?:\s*550)?\b/i);
      if (audionic?.[0]) {
        label = audionic[0];
        break;
      }
      const interested = m.memory.match(
        /interested in (?:purchasing |the )?([A-Z][^.]{3,50}?)(?:\.|,|$)/i
      );
      if (interested?.[1] && isPlausibleProductLabel(interested[1].trim())) {
        label = interested[1].trim();
        break;
      }
    }
  }

  if (label) {
    return `You were looking at *${label}*. Want me to pull it up again?`;
  }
  return `I don't have a saved product preference yet — send the name or SKU and I'll show it.`;
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
    case "catalog_product_pick": {
      return tryDirectCatalogProductPickReply(ctx, latestUser, history);
    }
    case "product_confirm": {
      return tryDirectProductConfirmReply(ctx, latestUser, history);
    }
    case "delivery_policy":
    case "return_policy": {
      return tryDirectPolicyReply(ctx, latestUser);
    }
    case "variant_selection": {
      const variant = await tryDirectVariantSelectionReply(
        ctx,
        latestUser,
        history
      );
      if (variant) return variant;
      return formatVariantOptionReprompt(history);
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

  // Returning / repeat hi — history-aware (won't spam opening)
  try {
    const greeting = tryDirectGreetingReply(
      enrichedCtx,
      latestUser,
      history
    );
    if (greeting) return greeting;
  } catch (err) {
    console.error("[run-sales-agent] greeting reply failed:", err);
  }

  // Identity / jokes — never catalog search ("who are you" ≠ product "who")
  try {
    const offTopic = tryDirectOffTopicReply(enrichedCtx, latestUser);
    if (offTopic) return offTopic;
  } catch (err) {
    console.error("[run-sales-agent] off-topic reply failed:", err);
  }

  // Human handoff — never product search
  if (looksLikeHumanHandoffRequest(latestUser)) {
    try {
      await executeSalesTool(
        "escalate_to_human",
        { reason: latestUser.slice(0, 200) },
        enrichedCtx
      );
    } catch (err) {
      console.error("[run-sales-agent] escalate_to_human failed:", err);
    }
    return buildHumanHandoffReply(enrichedCtx);
  }

  const memoryAsk = recallPitchedProductReply(enrichedCtx, history, latestUser);
  if (memoryAsk) return memoryAsk;

  // Fast path ONLY for clear structural intents (SKU, checkout details, browse, policy).
  // Price/discount/ambiguous chat → LLM (intent router may tip tool handlers, else Gemini).
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

  try {
    const intentRouted = await tryIntentRoutedReply(
      enrichedCtx,
      latestUser,
      history,
      exactRoute
    );
    if (intentRouted) return intentRouted;
  } catch (err) {
    console.error("[run-sales-agent] intent router failed:", err);
  }

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

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return runSalesAgentWithAnthropic(enrichedCtx, history);
    } catch (err) {
      console.error("[run-sales-agent] Anthropic agent error:", err);
    }
  }

  // Gemini failed — last-resort recovery for clear declines / price talk
  if (looksLikeOrderDecline(latestUser)) {
    try {
      const recovery = await tryDirectSalesRecoveryReply(
        enrichedCtx,
        latestUser,
        history
      );
      if (recovery) return recovery;
    } catch (err) {
      console.error("[run-sales-agent] recovery fallback failed:", err);
    }
  }

  // Buy-the-pitched-product before catalog error fallbacks
  try {
    if (looksLikeCheckoutMessage(latestUser, history)) {
      const checkout = await tryDirectCheckoutReply(
        enrichedCtx,
        latestUser,
        history
      );
      if (checkout) return checkout;
    }
  } catch (err) {
    console.error("[run-sales-agent] checkout fallback failed:", err);
  }

  try {
    const catalogPick = await tryDirectCatalogProductPickReply(
      enrichedCtx,
      latestUser,
      history
    );
    if (catalogPick) return catalogPick;
  } catch (err) {
    console.error("[run-sales-agent] catalog product pick fallback failed:", err);
  }

  try {
    if (looksLikeVariantSelection(latestUser, history)) {
      const variant = await tryDirectVariantSelectionReply(
        enrichedCtx,
        latestUser,
        history
      );
      if (variant) return variant;
      const reprompt = formatVariantOptionReprompt(history);
      if (reprompt) return reprompt;
    }
  } catch (err) {
    console.error("[run-sales-agent] variant fallback failed:", err);
  }

  try {
    const direct = await tryDirectProductReply(enrichedCtx, latestUser, history);
    if (direct?.reply) return direct.reply;
  } catch (err) {
    console.error("[run-sales-agent] direct product fallback failed:", err);
  }

  if (looksLikeHowAreYou(latestUser)) {
    return buildHowAreYouReply(enrichedCtx);
  }

  if (looksLikeHumanHandoffRequest(latestUser)) {
    return buildHumanHandoffReply(enrichedCtx);
  }

  // Never greet again when they clearly asked for a product
  if (
    looksLikeCasualGreeting(latestUser) ||
    (looksLikeOffTopicChat(latestUser) &&
      !looksLikeExactNamedProductQuery(latestUser))
  ) {
    if (assistantAlreadyWelcomed(history)) {
      return buildWaitingForQuestionReply();
    }
    return buildCasualGreetingReply(enrichedCtx);
  }

  if (
    looksLikeExactNamedProductQuery(latestUser) ||
    looksLikeRomanUrduProductAsk(latestUser)
  ) {
    return "Catalog check mein issue aa gaya — product name dobara bhejo ya SKU bhejo, main show karta hoon.";
  }

  if (catalogBrowseActiveInHistory(history)) {
    return "Which product from the list did you mean? Reply with the name and I'll show you.";
  }

  if (assistantAlreadyWelcomed(history)) {
    return buildWaitingForQuestionReply();
  }
  return buildCasualGreetingReply(enrichedCtx);
}
