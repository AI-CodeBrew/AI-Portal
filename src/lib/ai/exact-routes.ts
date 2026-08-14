import {
  extractSkuFromText,
  looksLikeCatalogBrowseMoreRequest,
  looksLikeCatalogBrowseRequest,
  looksLikeObjectionPhrase,
  looksLikeRomanUrduProductAsk,
  looksLikeBareProductNameQuery,
  productSearchTokens,
} from "@/lib/products/products-service";
import { parseCheckoutDetails, looksLikeCheckoutMessage } from "./checkout-parse";
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
  | "return_policy";

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
]);

/** Explicit "do you have X" / Roman Urdu ask / bare product name — not vague browse. */
export function looksLikeExactNamedProductQuery(text: string): boolean {
  const t = text.trim();
  if (t.length < 3) return false;
  if (looksLikeObjectionPhrase(t)) return false;
  if (looksLikeCasualGreeting(t)) return false;
  if (looksLikeCatalogBrowseRequest(t)) return false;
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

  // Browse / different products before greetings & confirm
  if (looksLikeCatalogBrowseMoreRequest(t, history)) return "catalog_more";
  if (looksLikeCatalogBrowseRequest(t)) return "catalog_browse";

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
