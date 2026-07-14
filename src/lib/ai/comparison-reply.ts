import type { AgentContext } from "./sales-tools";
import { executeSalesTool } from "./sales-tools";
import type { SearchProduct } from "./product-reply";
import { detectCustomerLanguage } from "./customer-language";
import {
  looksLikeProductComparison,
  extractComparisonTargets,
  hasComparisonUseCase,
  formatProductComparisonReply,
} from "./product-comparison";

async function fetchProductByQuery(
  ctx: AgentContext,
  query: string
): Promise<SearchProduct | null> {
  const { result } = await executeSalesTool(
    "get_product_details",
    { query },
    ctx
  );
  const product =
    result && typeof result === "object" && "product" in result
      ? (result as { product?: SearchProduct | null }).product
      : null;

  if (product) return product;

  const { result: searchResult } = await executeSalesTool(
    "search_products",
    { query },
    ctx
  );
  const products = (
    searchResult &&
    typeof searchResult === "object" &&
    "products" in searchResult
      ? (searchResult as { products?: SearchProduct[] }).products
      : []
  ) as SearchProduct[];

  if (!products.length) return null;

  const sku = query.toUpperCase();
  return (
    products.find((p) => (p.sku ?? "").toUpperCase() === sku) ?? products[0]!
  );
}

/** Compare 2+ products using live catalog lookups (one tool call per item). */
export async function tryDirectProductComparisonReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<{ reply: string; products: SearchProduct[] } | null> {
  if (!looksLikeProductComparison(latestUserMessage)) return null;

  const targets = extractComparisonTargets(latestUserMessage);
  if (targets.length < 2) return null;

  const lang = detectCustomerLanguage(history, latestUserMessage);
  const products: SearchProduct[] = [];

  for (const query of targets.slice(0, 3)) {
    const hit = await fetchProductByQuery(ctx, query);
    if (
      hit &&
      !products.some((p) => p.sku === hit.sku && p.title === hit.title)
    ) {
      products.push(hit);
    }
  }

  if (products.length < 2) return null;

  return {
    reply: formatProductComparisonReply(products, lang, {
      hasUseCase: hasComparisonUseCase(latestUserMessage, history),
      userText: latestUserMessage,
    }),
    products,
  };
}
