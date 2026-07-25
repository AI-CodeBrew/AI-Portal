import {
  getActiveLlmConfig,
  DEFAULT_GEMINI_INTENT_MODEL,
  normalizeGeminiIntentModel,
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
import {
  buildHowAreYouReply,
  tryDirectGreetingReply,
  tryDirectOffTopicReply,
} from "./greeting-reply";
import { formatVariantOptionReprompt } from "./variant-selection";
import { catalogBrowseActiveInHistory } from "@/lib/products/products-service";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/** Fallback chain if admin-selected intent model is unavailable on the API. */
const ROUTER_MODEL_FALLBACKS = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
] as const;

const CONFIDENCE_ACT = 0.72;
const CONFIDENCE_CLARIFY = 0.45;

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

const ROUTER_SYSTEM_PROMPT = `You classify WhatsApp sales chat intent for a store assistant.
Return ONLY valid JSON with this shape:
{
  "intent": "checkout|catalog_browse|catalog_more|catalog_product_pick|product_search|variant_selection|objection_recovery|product_image|greeting|how_are_you|off_topic|clarify|open_chat",
  "confidence": 0.0 to 1.0,
  "product_hint": "product name or SKU if known, else null",
  "variant_hint": "color/size option if known, else null",
  "clarify_question": "short WhatsApp question if intent is clarify, else null",
  "reason": "one short line for logs"
}

Rules:
- Use conversation context. Short replies like "yes", "that one", "ok", "yellow" refer to the LAST product/options the assistant showed.
- checkout: customer shares or confirms phone + delivery address to place order.
- catalog_browse: wants to see products without naming one.
- catalog_more: wants different/more products after a browse list.
- catalog_product_pick: picks a product from a recently shown browse list.
- product_search: asks about a named product, price, availability, or SKU.
- variant_selection: chooses size/color/option for a product already discussed.
- objection_recovery: price too high, not interested, too expensive, decline — NOT a new product search.
- product_image: asks to see/send product photo.
- greeting / how_are_you / off_topic: small talk.
- clarify: message is ambiguous; ask ONE short confirming question (use product_hint/variant_hint when possible).
- open_chat: general question best handled by full sales agent (order status, policies, complex ask).
- Never choose product_search for price objections.
- confidence: 0.9+ only when very clear; 0.5-0.7 when guessing; use clarify intent when unsure.`;

function formatHistoryForRouter(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  latestUser: string
): string {
  const recent = history.slice(-8);
  const lines = recent.map(
    (m) => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.content.slice(0, 500)}`
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
        : 0.5,
      product_hint:
        typeof data.product_hint === "string" && data.product_hint.trim()
          ? data.product_hint.trim()
          : null,
      variant_hint:
        typeof data.variant_hint === "string" && data.variant_hint.trim()
          ? data.variant_hint.trim()
          : null,
      clarify_question:
        typeof data.clarify_question === "string" &&
        data.clarify_question.trim()
          ? data.clarify_question.trim().slice(0, 320)
          : null,
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
  primaryModel: string
): Promise<IntentRouterResult | null> {
  let lastError = "";
  const models = [
    normalizeGeminiIntentModel(primaryModel),
    ...ROUTER_MODEL_FALLBACKS.filter(
      (m) => m !== normalizeGeminiIntentModel(primaryModel)
    ),
  ];

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
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `Classify the customer's latest intent from this WhatsApp thread:\n\n${transcript}`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.15,
              maxOutputTokens: 512,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!res.ok) {
        lastError = await res.text();
        if (res.status === 404) continue;
        throw new Error(`Gemini router ${model}: ${lastError.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const text =
        data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          .trim() ?? "";

      const parsed = parseRouterJson(text);
      if (parsed) {
        console.log(
          `[intent-router] model=${model} intent=${parsed.intent} confidence=${parsed.confidence} reason=${parsed.reason ?? ""}`
        );
        return parsed;
      }
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

async function executeRoutedIntent(
  ctx: AgentContext,
  latestUser: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  routed: IntentRouterResult
): Promise<string | null> {
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
      const variant = await tryDirectVariantSelectionReply(ctx, message, history);
      if (variant) return variant;
      return formatVariantOptionReprompt(history);
    }
    case "objection_recovery":
      return tryDirectSalesRecoveryReply(ctx, message, history);
    case "product_image":
      return tryDirectProductImageReply(ctx, message, history);
    case "greeting":
      return tryDirectGreetingReply(ctx, message);
    case "how_are_you":
      return buildHowAreYouReply(ctx);
    case "off_topic":
      return tryDirectOffTopicReply(ctx, message);
    case "clarify":
      return null;
    case "open_chat":
      return null;
    default:
      return null;
  }
}

function defaultClarifyQuestion(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  routed: IntentRouterResult
): string {
  if (routed.product_hint && routed.variant_hint) {
    return `Just to confirm — you want *${routed.product_hint}* in *${routed.variant_hint}*? Reply yes or tell me the correct option.`;
  }
  if (routed.product_hint) {
    return `Did you mean *${routed.product_hint}*? Reply with the product name or say yes to continue.`;
  }
  if (catalogBrowseActiveInHistory(history)) {
    return "Which product from the list did you mean? Reply with the name (e.g. Audionic ENC).";
  }
  return "I want to help — are you looking for a product, choosing a size/color, or ready to share phone & address to order?";
}

/**
 * Gemini intent router for ambiguous messages (no exact regex route).
 * Returns a handler reply, a clarifying question, or null to fall through to full LLM.
 */
export async function tryIntentRoutedReply(
  ctx: AgentContext,
  latestUser: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  exactRoute: ExactDirectRoute | null
): Promise<string | null> {
  if (!shouldRunIntentRouter(latestUser, exactRoute)) return null;

  if (looksLikeOrderDecline(latestUser)) {
    const recovery = await tryDirectSalesRecoveryReply(
      ctx,
      latestUser,
      history
    );
    if (recovery) return recovery;
  }

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

  if (
    routed.intent === "clarify" ||
    routed.confidence < CONFIDENCE_CLARIFY
  ) {
    return (
      routed.clarify_question?.trim() ||
      defaultClarifyQuestion(history, routed)
    );
  }

  if (routed.confidence < CONFIDENCE_ACT) {
    return (
      routed.clarify_question?.trim() ||
      defaultClarifyQuestion(history, routed)
    );
  }

  if (routed.intent === "open_chat") {
    return null;
  }

  const reply = await executeRoutedIntent(ctx, latestUser, history, routed);
  if (reply) return reply;

  if (routed.confidence >= CONFIDENCE_ACT) {
    return (
      routed.clarify_question?.trim() ||
      defaultClarifyQuestion(history, routed)
    );
  }

  return null;
}
