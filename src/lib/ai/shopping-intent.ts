import {
  extractSkuFromText,
  looksLikeCatalogBrowseMoreRequest,
  looksLikeCatalogBrowseRequest,
  looksLikeObjectionPhrase,
} from "@/lib/products/products-service";
import { looksLikeExactNamedProductQuery } from "./exact-routes";

/** @deprecated Use resolveExactDirectRoute — kept for imports that expect shopping intent. */
export function looksLikeShoppingIntent(
  text: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): boolean {
  if (looksLikeObjectionPhrase(text.trim())) return false;
  if (extractSkuFromText(text)) return true;
  if (looksLikeCatalogBrowseRequest(text)) return true;
  if (looksLikeCatalogBrowseMoreRequest(text, history)) return true;
  return looksLikeExactNamedProductQuery(text);
}

export { pickInitialCatalogTool, resolveExactDirectRoute } from "./exact-routes";
export type { ExactDirectRoute } from "./exact-routes";
export { looksLikeExactNamedProductQuery } from "./exact-routes";
