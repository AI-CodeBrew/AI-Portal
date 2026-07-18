import {
  extractSkuFromText,
  looksLikeCatalogBrowseMoreRequest,
  looksLikeCatalogBrowseRequest,
  looksLikeObjectionPhrase,
  productSearchTokens,
} from "@/lib/products/products-service";
import { parseCheckoutDetails } from "./checkout-parse";
import {
  looksLikeHowAreYou,
  looksLikeOffTopicChat,
  looksLikeExactGreetingOnly,
} from "./greeting-reply";
import { looksLikeVariantSelection } from "./variant-selection";

/** Routes that may bypass the LLM when the message is an exact pattern match. */
export type ExactDirectRoute =
  | "checkout"
  | "catalog_browse"
  | "catalog_more"
  | "sku_search"
  | "named_product_search"
  | "variant_selection"
  | "greeting_only"
  | "how_are_you"
  | "off_topic";

const EXPLICIT_NAMED_PRODUCT_ASK =
  /\b(?:do you have|have you got|got any|how much is|how much for|what(?:'s| is) the price of|price of|tell me about|details (?:on|about|for)|looking for|searching for|i want (?:to buy|info on)|need info on)\b[\s,:-]*(.+)/i;

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

/** Explicit "do you have X" / "price of X" with a real product name — not vague browse. */
export function looksLikeExactNamedProductQuery(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (looksLikeObjectionPhrase(t)) return false;
  if (looksLikeCatalogBrowseRequest(t)) return false;
  if (extractSkuFromText(t)) return true;

  const m = t.match(EXPLICIT_NAMED_PRODUCT_ASK);
  if (!m?.[1]) return false;

  let phrase = m[1].replace(/[?.!]+$/g, "").trim();
  phrase = phrase.replace(/^the\s+/i, "").trim();

  const tokens = productSearchTokens(phrase).filter(
    (token) => !NAMED_PRODUCT_FILLER.has(token.toLowerCase())
  );
  return tokens.length >= 1 && tokens.join(" ").length >= 3;
}

/** True only when a deterministic regex handler should run (not fuzzy guessing). */
export function resolveExactDirectRoute(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): ExactDirectRoute | null {
  const t = message.trim();
  if (t.length < 2) return null;

  if (parseCheckoutDetails(t)) return "checkout";

  if (looksLikeCatalogBrowseMoreRequest(t, history)) return "catalog_more";
  if (looksLikeCatalogBrowseRequest(t)) return "catalog_browse";

  if (extractSkuFromText(t)) return "sku_search";

  if (looksLikeExactNamedProductQuery(t)) return "named_product_search";

  if (looksLikeVariantSelection(t, history)) return "variant_selection";

  if (looksLikeHowAreYou(t)) return "how_are_you";
  if (looksLikeOffTopicChat(t)) return "off_topic";
  if (looksLikeExactGreetingOnly(t)) return "greeting_only";

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
