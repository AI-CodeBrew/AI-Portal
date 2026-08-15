import {
  getActiveLlmConfig,
  DEFAULT_GEMINI_INTENT_MODEL,
} from "@/lib/platform/llm-settings";
import type { AgentContext } from "./sales-tools";
import type { ExactDirectRoute } from "./exact-routes";
import { tryDirectCheckoutReply } from "./checkout-reply";
import {
  tryDirectSalesRecoveryReply,
  looksLikeOrderDecline,
} from "./sales-recovery";
import {
  tryDirectProductReply,
  tryDirectVariantSelectionReply,
  tryDirectCatalogBrowseReply,
  tryDirectCatalogProductPickReply,
  tryDirectProductImageReply,
} from "./product-reply";
import { formatVariantOptionReprompt } from "./variant-selection";
import { looksLikeBuyActiveProductIntent, isProductPitchFresh } from "./checkout-parse";
import {
  looksLikeVagueShoppingIntent,
  looksLikeCatalogBrowseMoreRequest,
} from "@/lib/products/products-service";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/** Fallback chain if admin-selected intent model is unavailable on the API. */
const ROUTER_MODEL_FALLBACKS = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
] as const;

/** Only act on tool-ish intents when the classifier is confident. */
const CONFIDENCE_ACT = 0.78;

export type SalesIntent =
  | "checkout"
  | "catalog_browse"
  | "catalog_more"
  | "catalog_product_pick"
  | "product_search"
  | "variant_selection"
  | "objection_recovery"
  | "product_image"
  | "greeting"
  | "how_are_you"
  | "off_topic"
  | "clarify"
  | "open_chat";

export type IntentRouterResult = {
  intent: SalesIntent;
  confidence: number;
  product_hint: string | null;
  variant_hint: string | null;
  clarify_question: string | null;
  reason: string | null;
};

/**
 * Lightweight classifier only — does NOT invent customer replies.
 * Conversational intents return null so the full sales LLM answers.
 */
const ROUTER_SYSTEM_PROMPT = `You classify WhatsApp sales chat intent for a store assistant.
Return ONLY valid JSON:
{
  "intent": "checkout|catalog_browse|catalog_more|catalog_product_pick|product_search|variant_selection|objection_recovery|product_image|greeting|how_are_you|off_topic|clarify|open_chat",
  "confidence": 0.0 to 1.0,
  "product_hint": "product name or SKU if known, else null",
  "variant_hint": "color/size option if known, else null",
  "clarify_question": null,
  "reason": "one short line for logs"
}

Rules:
- Use conversation context. Short replies like "yes", "that one", "ok", "yellow" refer to the LAST product/options the assistant showed.
- checkout: customer shares phone + delivery address to place order, OR says they want to buy/order the product just shown ("I want to buy it", "I'll take this", "order it") without naming a different product. NOT "I want to buy something" (that's catalog_browse).
- catalog_browse / catalog_more: wants to see products / other products / "something else" / "I want to buy something" — NOT "I want to buy it" after a fresh product pitch.
- catalog_product_pick: picks one from a recently shown browse list by name.
- product_search: named product, price of a named item, or SKU. NEVER product_search for "it" / "this" / "that" / "something else" alone.
- variant_selection: chooses size/color for a product already discussed.
- objection_recovery: costly, expensive, discount, offer, % off, bulk, won't buy, not interested — any price pushback. NOT product_search.
- product_image: wants a photo.
- greeting / how_are_you / off_topic / clarify / open_chat: conversational — classify only; the main LLM will reply.
- NEVER invent a customer-facing clarify question. Set clarify_question to null.
- Never choose product_search for discount/price objections.
- confidence: 0.9+ when very clear; lower when unsure.`;

function formatHistoryForRouter(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  latestUser: string
): string {
  const recent = history.slice(-8);
  const lines = recent.map(
    (m) =>
      `${m.role === "user" ? "Customer" : "Assistant"}: ${m.content.slice(0, 500)}`
  );
  if (!lines.length || recent[recent.length - 1]?.content !== latestUser) {
    lines.push(`Customer: ${latestUser}`);
  }
  return lines.join("\n\n");
}

function parseRouterJson(raw: string): IntentRouterResult | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const data = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const intent = String(data.intent ?? "").trim() as SalesIntent;
    const valid: SalesIntent[] = [
      "checkout",
      "catalog_browse",
      "catalog_more",
      "catalog_product_pick",
      "product_search",
      "variant_selection",
      "objection_recovery",
      "product_image",
      "greeting",
      "how_are_you",
      "off_topic",
      "clarify",
      "open_chat",
    ];
    if (!valid.includes(intent)) return null;
    const confidence = Number(data.confidence);
    return {
      intent,
      confidence: Number.isFinite(confidence)
        ? Math.min(1, Math.max(0, confidence))
        : 0,
      product_hint:
        typeof data.product_hint === "string" && data.product_hint.trim()
          ? data.product_hint.trim().slice(0, 120)
          : null,
      variant_hint:
        typeof data.variant_hint === "string" && data.variant_hint.trim()
          ? data.variant_hint.trim().slice(0, 80)
          : null,
      clarify_question: null,
      reason:
        typeof data.reason === "string" && data.reason.trim()
          ? data.reason.trim().slice(0, 200)
          : null,
    };
  } catch {
    return null;
  }
}

async function callGeminiIntentRouter(
  apiKey: string,
  transcript: string,
  preferredModel: string
): Promise<IntentRouterResult | null> {
  const models = [
    preferredModel,
    ...ROUTER_MODEL_FALLBACKS.filter((m) => m !== preferredModel),
  ];

  let lastError: string | null = null;
  for (const model of models) {
    try {
      const res = await fetch(
        `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: ROUTER_SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: transcript }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 256,
              responseMimeType: "application/json",
            },
          }),
        }
      );
      const raw = await res.text();
      if (!res.ok) {
        lastError = `${model} HTTP ${res.status}: ${raw.slice(0, 200)}`;
        continue;
      }
      const data = JSON.parse(raw) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const text = data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim();
      if (!text) {
        lastError = `${model}: empty response`;
        continue;
      }
      const parsed = parseRouterJson(text);
      if (parsed) return parsed;
      lastError = `${model}: could not parse JSON`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[intent-router] ${model} failed:`, lastError);
    }
  }

  if (lastError) {
    console.error("[intent-router] all models failed:", lastError.slice(0, 300));
  }
  return null;
}

export function shouldRunIntentRouter(
  latestUser: string,
  exactRoute: ExactDirectRoute | null
): boolean {
  const t = latestUser.trim();
  if (t.length < 2) return false;
  if (exactRoute) return false;
  return true;
}

function buildRoutedUserMessage(
  latestUser: string,
  routed: IntentRouterResult
): string {
  const base = latestUser.trim();
  const product = routed.product_hint?.trim();
  const variant = routed.variant_hint?.trim();

  switch (routed.intent) {
    case "catalog_product_pick":
      if (product && !base.toLowerCase().includes(product.toLowerCase())) {
        return `i want ${product}`;
      }
      return base;
    case "product_search":
      if (product && base.split(/\s+/).length <= 4) {
        return product;
      }
      return product ? `${base} ${product}`.trim() : base;
    case "variant_selection":
      return variant || base;
    default:
      return base;
  }
}

/** Intents the full sales LLM should answer (no hardcoded reply). */
const LLM_OWNED_INTENTS = new Set<SalesIntent>([
  "objection_recovery",
  "greeting",
  "how_are_you",
  "off_topic",
  "clarify",
  "open_chat",
]);

async function executeRoutedIntent(
  ctx: AgentContext,
  latestUser: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  routed: IntentRouterResult
): Promise<string | null> {
  if (LLM_OWNED_INTENTS.has(routed.intent)) {
    return null;
  }

  const message = buildRoutedUserMessage(latestUser, routed);

  switch (routed.intent) {
    case "checkout":
      return tryDirectCheckoutReply(ctx, message, history);
    case "catalog_browse":
      return tryDirectCatalogBrowseReply(ctx, message, history);
    case "catalog_more":
      return tryDirectCatalogBrowseReply(ctx, message, history);
    case "catalog_product_pick":
      return tryDirectCatalogProductPickReply(ctx, message, history);
    case "product_search": {
      const direct = await tryDirectProductReply(ctx, message, history);
      return direct?.reply ?? null;
    }
    case "variant_selection": {
      const variant = await tryDirectVariantSelectionReply(
        ctx,
        message,
        history
      );
      if (variant) return variant;
      return formatVariantOptionReprompt(history);
    }
    case "product_image":
      return tryDirectProductImageReply(ctx, message, history);
    default:
      return null;
  }
}

/**
 * LLM classifies intent. Tool-ish intents may run handlers.
 * Price/discount/small-talk/clarify → null so the main sales LLM replies.
 * Never returns hardcoded "Did you mean…?" copy.
 */
export async function tryIntentRoutedReply(
  ctx: AgentContext,
  latestUser: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  exactRoute: ExactDirectRoute | null
): Promise<string | null> {
  if (!shouldRunIntentRouter(latestUser, exactRoute)) return null;

  const llm = await getActiveLlmConfig();
  const apiKey = llm.geminiApiKey;
  if (!apiKey) {
    console.warn("[intent-router] skipped — no Gemini API key");
    return null;
  }

  const intentModel =
    llm.geminiIntentModel?.trim() || DEFAULT_GEMINI_INTENT_MODEL;
  const transcript = formatHistoryForRouter(history, latestUser);
  const routed = await callGeminiIntentRouter(apiKey, transcript, intentModel);
  if (!routed) return null;

  console.log(
    `[intent-router] intent=${routed.intent} conf=${routed.confidence.toFixed(2)} reason=${routed.reason ?? ""}`
  );

  // Conversational / price / unclear → main Gemini sales agent
  if (LLM_OWNED_INTENTS.has(routed.intent) || routed.confidence < CONFIDENCE_ACT) {
    return null;
  }

  if (
    looksLikeVagueShoppingIntent(latestUser) ||
    looksLikeCatalogBrowseMoreRequest(latestUser, history)
  ) {
    return tryDirectCatalogBrowseReply(ctx, latestUser, history);
  }

  // "I want to buy it" → checkout only while the pitch is still this visit
  if (
    looksLikeBuyActiveProductIntent(latestUser) &&
    isProductPitchFresh(history) &&
    (routed.intent === "product_search" ||
      routed.intent === "catalog_browse" ||
      routed.intent === "catalog_more" ||
      routed.intent === "catalog_product_pick")
  ) {
    return tryDirectCheckoutReply(ctx, latestUser, history);
  }

  // Don't treat price talk as product search even if classifier slips
  if (
    routed.intent === "product_search" &&
    looksLikeOrderDecline(latestUser)
  ) {
    return null;
  }

  const reply = await executeRoutedIntent(ctx, latestUser, history, routed);
  return reply;
}

/** @deprecated recovery is LLM-owned; kept for Gemini-failure fallback only */
export async function tryRecoveryIfDecline(
  ctx: AgentContext,
  latestUser: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string | null> {
  if (!looksLikeOrderDecline(latestUser)) return null;
  return tryDirectSalesRecoveryReply(ctx, latestUser, history);
}
