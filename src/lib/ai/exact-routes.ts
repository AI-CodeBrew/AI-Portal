import {
  extractSkuFromText,
  looksLikeCatalogBrowseMoreRequest,
  looksLikeCatalogBrowseRequest,
  looksLikeObjectionPhrase,
  looksLikeRomanUrduProductAsk,
  looksLikeBareProductNameQuery,
  looksLikeVagueShoppingIntent,
  productSearchTokens,
} from "@/lib/products/products-service";
import { parseCheckoutDetails, looksLikeCheckoutMessage, looksLikeBuyActiveProductIntent, isProductPitchFresh } from "./checkout-parse";
import { looksLikeCatalogProductPick } from "./catalog-browse-pick";
import { looksLikeProductConfirmAffirmation } from "./product-confirm";
import {
  looksLikeDeliveryEtaQuestion,
  looksLikeReturnOrDamageQuestion,
} from "./policy-reply";
import { looksLikeVariantSelection } from "./variant-selection";
import { looksLikeCasualGreeting } from "./greeting-reply";

/** Routes that may bypass the LLM when the message is an exact pattern match. */
export type ExactDirectRoute =
  | "checkout"
  | "catalog_browse"
  | "catalog_more"
  | "catalog_product_pick"
  | "sku_search"
  | "named_product_search"
  | "variant_selection"
  | "product_confirm"
  | "delivery_policy"
  | "return_policy"
  | "stale_product_nudge";

const EXPLICIT_NAMED_PRODUCT_ASK =
  /\b(?:do you have|have you got|got any|how much is|how much for|what(?:'s| is) the price of|price of|tell me about|details (?:on|about|for)|looking for|searching for|i want(?:\s+(?:to buy|info on|the|a|an))?|need info on|i(?:'ll| will) take)\b[\s,:-]*(.+)/i;

const NAMED_PRODUCT_FILLER = new Set([
  "product",
  "products",
  "item",
  "items",
  "something",
  "anything",
  "this",
  "that",
  "it",
  "one",
  "please",
  "thanks",
  "else",
  "other",
]);

/** Explicit "do you have X" / Roman Urdu ask / bare product name — not vague browse. */
export function looksLikeExactNamedProductQuery(text: string): boolean {
  const t = text.trim();
  if (t.length < 3) return false;
  if (looksLikeObjectionPhrase(t)) return false;
  if (looksLikeCasualGreeting(t)) return false;
  if (looksLikeCatalogBrowseRequest(t)) return false;
  if (looksLikeVagueShoppingIntent(t)) return false;
  // Buy the pitched product — not a new catalog query
  if (
    /\b(?:want(?:a|\s+to)\s+(?:order|buy)|buy|order|take|book)\s+(?:it|this|that|this\s+one|that\s+one)\b/i.test(
      t
    ) ||
    /\bi('ll| will)\s+take\s+(?:it|this|that)\b/i.test(t)
  ) {
    return false;
  }
  // Memory / history questions — LLM + Mem0, not catalog search
  if (
    /\b(what (product )?(was|were|did) i|was i (interested|looking)|looking at before|remember (me|what)|interested in before)\b/i.test(
      t
    )
  ) {
    return false;
  }
  // Human handoff — not a product
  if (
    /\b((talk|speak|chat|connect|transfer)\s+(to\s+)?(a\s+)?(human|person|agent)|live\s+agent|real\s+person)\b/i.test(
      t
    )
  ) {
    return false;
  }
  // Trust / stall / process questions — not SKU names
  if (
    /\b(original|genuine|copy|fake|warranty|guarantee|quality|does it last|cod|cash on delivery|just looking|just browsing|ask my (wife|husband)|website|web\s*site|product link|send (me )?(a )?(photo|pic|image|link)|do you (do|accept) cod)\b/i.test(
      t
    )
  ) {
    return false;
  }
  // Identity / chitchat — never treat as a product name
  if (
    /\b(who\s+(are|r)\s+(you|u)|who\s+is\s+this|what(?:'s| is)\s+your\s+name|are you (an? )?(ai|bot)|hey\s+again|remember\s+me)\b/i.test(
      t
    )
  ) {
    return false;
  }
  if (extractSkuFromText(t)) return true;

  if (looksLikeRomanUrduProductAsk(t)) {
    const tokens = productSearchTokens(t);
    return tokens.length >= 1 && tokens.join(" ").length >= 3;
  }

  const m = t.match(EXPLICIT_NAMED_PRODUCT_ASK);
  if (m?.[1]) {
    let phrase = m[1].replace(/[?.!]+$/g, "").trim();
    phrase = phrase.replace(/^the\s+/i, "").trim();
    const tokens = productSearchTokens(phrase).filter(
      (token) => !NAMED_PRODUCT_FILLER.has(token.toLowerCase())
    );
    if (tokens.length >= 1 && tokens.join(" ").length >= 3) return true;
  }

  // "Audionic buds" after we asked for a product name
  return looksLikeBareProductNameQuery(t);
}

/** True only when a deterministic regex handler should run (not fuzzy guessing). */
export function resolveExactDirectRoute(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): ExactDirectRoute | null {
  const t = message.trim();
  if (t.length < 2) return null;

  if (parseCheckoutDetails(t) || looksLikeCheckoutMessage(t, history)) {
    return "checkout";
  }

  if (looksLikeCatalogBrowseMoreRequest(t, history)) return "catalog_more";
  if (looksLikeCatalogBrowseRequest(t) || looksLikeVagueShoppingIntent(t)) {
    return "catalog_browse";
  }

  if (
    looksLikeBuyActiveProductIntent(t) &&
    !isProductPitchFresh(history)
  ) {
    return "stale_product_nudge";
  }

  if (looksLikeProductConfirmAffirmation(t, history)) return "product_confirm";

  // Factual policies only — conversational intents go to the LLM
  if (looksLikeDeliveryEtaQuestion(t)) return "delivery_policy";
  if (looksLikeReturnOrDamageQuestion(t)) return "return_policy";

  // Greetings / identity → LLM (avoids double-hardcoded intros)
  // kept out of exact routes on purpose

  if (looksLikeVariantSelection(t, history)) return "variant_selection";

  if (looksLikeCatalogProductPick(t, history)) return "catalog_product_pick";

  if (extractSkuFromText(t)) return "sku_search";

  if (looksLikeExactNamedProductQuery(t)) return "named_product_search";

  return null;
}

/** Force a catalog tool on turn 1 only when the message is an exact shopping pattern. */
export function pickInitialCatalogTool(
  text: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): "browse_catalog" | "search_products" | null {
  const route = resolveExactDirectRoute(text, history);
  if (
    route === "catalog_browse" ||
    route === "catalog_more"
  ) {
    return "browse_catalog";
  }
  if (route === "sku_search" || route === "named_product_search") {
    return "search_products";
  }
  return null;
}
