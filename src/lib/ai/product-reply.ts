import {
  extractSkuFromText,
  extractProductSearchQuery,
  getPrimaryProductImageUrl,
} from "@/lib/products/products-service";
import { executeSalesTool, type AgentContext } from "./sales-tools";
import { orderDetailsTemplate } from "./order-details-template";
import {
  customerMsg,
  detectCustomerLanguage,
  MULTILINGUAL_GREETING,
  MULTILINGUAL_PRODUCT_ASK,
  type CustomerReplyLanguage,
} from "./customer-language";
import {
  buildOosOfferMarker,
  findSimilarInStockProduct,
  isProductOutOfStock,
  lastOosOfferFromHistory,
  parseStockPreference,
  pickRequestedProduct,
} from "./product-stock";
import { looksLikeProductComparison } from "./product-comparison";
import { productSearchTokens } from "@/lib/products/products-service";

export type SearchProduct = {
  title?: string;
  sku?: string;
  description?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  options?: Array<{ name?: string; values?: string[] }>;
  bundles?: Array<{
    quantity?: number;
    price_formatted?: string;
    label?: string | null;
  }>;
  variants?: Array<{
    id?: string;
    title?: string;
    sku?: string | null;
    price_formatted?: string;
    in_stock?: boolean;
    option_values?: Record<string, string>;
  }>;
};

const ORDER_ONLY_PATTERN =
  /\b(order|tracking|delivery|shipped|where is my|my order|order status|dispatch)\b/i;

const PRODUCT_ASK_PATTERN =
  /\b(price|cost|how much|do you have|available|in stock|product|products|buy|sell|show me|looking for|details|about|sku|want this|variant|variants|option|options|size|sizes|color|colors|colour|colours)\b/i;

const GREETING_ONLY = MULTILINGUAL_GREETING;

const CHECKOUT_HIJACK =
  /\b(place\s+(an\s+)?order|want\s+to\s+(order|buy)|my name|address|phone|checkout|deliver)\b/i;

/** Out-of-stock reply: empathy + similar alternative + back-in-stock option. */
export function formatOutOfStockReply(
  product: SearchProduct,
  similar: SearchProduct | null,
  lang: CustomerReplyLanguage
): string {
  const title = product.title || "this product";
  const marker = buildOosOfferMarker(product, similar);

  if (similar?.title) {
    return `${marker}\n${customerMsg("oosWithSimilar", lang, {
      similar: similar.title,
    })}`;
  }

  return `${marker}\n${customerMsg("oosNoSimilarNotify", lang, {
    product: title,
  })}`;
}

/** Format in-stock catalog hits (skips want-to-order when primary is OOS — use formatOutOfStockReply). */
export function formatProductsReply(
  products: SearchProduct[],
  lang: CustomerReplyLanguage = "en"
): string {
  if (!products.length) {
    return customerMsg("productNotFound", lang);
  }

  const imageMarkers: string[] = [];

  const blocks = products.slice(0, 2).map((p) => {
    const imageUrl = getPrimaryProductImageUrl(p);
    if (
      imageUrl &&
      imageMarkers.length < 2 &&
      !imageMarkers.some((m) => m.includes(imageUrl))
    ) {
      imageMarkers.push(`[Image: ${imageUrl}]`);
    }

    const realVariants = (p.variants ?? []).filter(
      (v) => v.title && v.title !== "Default"
    );
    const defaultVariant = (p.variants ?? []).find(
      (v) => !v.title || v.title === "Default"
    );
    const basePriceRaw =
      realVariants[0]?.price_formatted ||
      defaultVariant?.price_formatted ||
      p.variants?.[0]?.price_formatted;
    const basePrice =
      basePriceRaw &&
      !/see store for price/i.test(basePriceRaw) &&
      basePriceRaw !== "0"
        ? basePriceRaw
        : null;

    const refId =
      realVariants[0]?.id || defaultVariant?.id || p.variants?.[0]?.id || null;

    const optionsLine = (p.options ?? [])
      .filter((o) => o.name && (o.values?.length ?? 0) > 0)
      .slice(0, 3)
      .map((o) => `${o.name}: ${(o.values ?? []).slice(0, 6).join(", ")}`)
      .join(" · ");

    const variantLines =
      realVariants.length > 0
        ? realVariants.slice(0, 6).map((v) => {
            const label = v.title || customerMsg("variant", lang);
            const price = v.price_formatted ? ` — ${v.price_formatted}` : "";
            const stock =
              v.in_stock === false
                ? ` ${customerMsg("outOfStock", lang)}`
                : "";
            return `• ${label}${price}${stock}`;
          })
        : [];

    const bundleLines = (p.bundles ?? [])
      .filter((b) => b.quantity && b.price_formatted)
      .slice(0, 3)
      .map((b) => {
        const label = b.label?.trim() || `${b.quantity}-pack`;
        return `• ${label}: ${b.price_formatted}`;
      });

    const outOfStock =
      realVariants.length > 0 &&
      realVariants.every((v) => v.in_stock === false);

    return [
      // Keep Ref internal for order placement; stripped before WhatsApp send
      refId ? `[Ref: ${refId}]` : null,
      `*${p.title || "Product"}*`,
      p.sku ? `${customerMsg("sku", lang)} ${p.sku}` : null,
      basePrice ? `${customerMsg("price", lang)} ${basePrice}` : null,
      outOfStock
        ? customerMsg("stockOut", lang)
        : customerMsg("stockAvailable", lang),
      optionsLine ? optionsLine : null,
      variantLines.length ? variantLines.join("\n") : null,
      bundleLines.length
        ? `${customerMsg("bundles", lang)}\n${bundleLines.join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const multi =
    products.length > 1
      ? `\n\n${customerMsg("multipleMatches", lang, {
          count: Math.min(products.length, 2),
        })}`
      : "";

  const hasVariants = products.some((p) =>
    (p.variants ?? []).some((v) => v.title && v.title !== "Default")
  );

  const prefix = imageMarkers.length ? `${imageMarkers.join("\n")}\n` : "";

  return `${prefix}${blocks.join("\n\n")}${multi}\n\n${customerMsg("wantToOrder", lang)}\n${orderDetailsTemplate(
    { includeVariantHint: hasVariants, lang }
  )}`;
}

function shouldTryDirectProductLookup(message: string): boolean {
  const t = message.trim();
  if (t.length < 2) return false;
  if (GREETING_ONLY.test(t)) return false;
  // Never treat checkout / place-order messages as product search
  if (CHECKOUT_HIJACK.test(t) && /\d{8,}/.test(t.replace(/\D/g, ""))) {
    return false;
  }
  if (CHECKOUT_HIJACK.test(t) && /\b(name|address|phone)\b/i.test(t)) {
    return false;
  }
  if (ORDER_ONLY_PATTERN.test(t) && !PRODUCT_ASK_PATTERN.test(t)) return false;
  if (looksLikeProductComparison(t)) return false;
  if (extractSkuFromText(t) && !CHECKOUT_HIJACK.test(t)) return true;
  if (
    (PRODUCT_ASK_PATTERN.test(t) || MULTILINGUAL_PRODUCT_ASK.test(t)) &&
    !CHECKOUT_HIJACK.test(t)
  ) {
    return true;
  }
  // Short name-only messages: "nike shoes", "red dress M"
  const query = extractProductSearchQuery(t);
  if (!query) return false;
  if (t.length <= 80 && !ORDER_ONLY_PATTERN.test(t) && !CHECKOUT_HIJACK.test(t)) {
    return true;
  }
  return false;
}

/**
 * Look up catalog by SKU or product name (full/partial) and answer with details + variants.
 * Used so replies don't depend on the model calling tools.
 */
export async function tryDirectProductReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<{ reply: string; products: SearchProduct[] } | null> {
  if (!shouldTryDirectProductLookup(latestUserMessage)) return null;

  const lang = detectCustomerLanguage(history, latestUserMessage);

  const sku = extractSkuFromText(latestUserMessage);
  const query =
    sku || extractProductSearchQuery(latestUserMessage);
  if (!query) return null;

  const { result } = await executeSalesTool(
    "search_products",
    { query },
    ctx
  );
  const products = (
    result && typeof result === "object" && "products" in result
      ? (result as { products?: SearchProduct[] }).products
      : []
  ) as SearchProduct[];

  if (!products?.length) {
    // Only hard-fail for explicit SKU; name misses can fall through to the LLM
    if (sku) {
      return {
        reply: customerMsg("skuNotFound", lang, { sku }),
        products: [],
      };
    }
    return null;
  }

  const requested = pickRequestedProduct(products, query, sku);

  if (isProductOutOfStock(requested)) {
    const similar = await findSimilarWithExtraSearch(ctx, requested, products);
    return {
      reply: formatOutOfStockReply(requested, similar, lang),
      products: similar ? [requested, similar] : [requested],
    };
  }

  return { reply: formatProductsReply(products, lang), products };
}

/** Follow-up after out-of-stock offer: show similar product or confirm back-in-stock alert. */
export async function tryDirectStockPreferenceReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<{ reply: string; products: SearchProduct[] } | null> {
  const oos = lastOosOfferFromHistory(history);
  if (!oos) return null;

  const pref = parseStockPreference(latestUserMessage);
  if (!pref) return null;

  const lang = detectCustomerLanguage(history, latestUserMessage);
  const productLabel = oos.title || oos.sku || "this product";

  if (pref === "notify") {
    return {
      reply: customerMsg("oosNotifyConfirmed", lang, { product: productLabel }),
      products: [],
    };
  }

  // Show similar product
  if (oos.altSku || oos.altTitle) {
    const query = oos.altSku || oos.altTitle;
    const { result } = await executeSalesTool(
      "search_products",
      { query },
      ctx
    );
    const products = (
      result && typeof result === "object" && "products" in result
        ? (result as { products?: SearchProduct[] }).products
        : []
    ) as SearchProduct[];

    const similar =
      products.find(
        (p) =>
          (oos.altSku && p.sku?.toUpperCase() === oos.altSku.toUpperCase()) ||
          (oos.altTitle &&
            (p.title ?? "").toLowerCase() === oos.altTitle.toLowerCase())
      ) ?? products.find((p) => !isProductOutOfStock(p));

    if (similar && !isProductOutOfStock(similar)) {
      return {
        reply: formatProductsReply([similar], lang),
        products: [similar],
      };
    }
  }

  return {
    reply: customerMsg("oosNotifyConfirmed", lang, { product: productLabel }),
    products: [],
  };
}

async function findSimilarWithExtraSearch(
  ctx: AgentContext,
  requested: SearchProduct,
  products: SearchProduct[]
): Promise<SearchProduct | null> {
  let similar = findSimilarInStockProduct(requested, products);
  if (similar) return similar;

  const tokens = productSearchTokens(requested.title ?? "");
  if (tokens.length === 0) return null;

  const { result } = await executeSalesTool(
    "search_products",
    { query: tokens.slice(0, 3).join(" ") },
    ctx
  );
  const extra = (
    result && typeof result === "object" && "products" in result
      ? (result as { products?: SearchProduct[] }).products
      : []
  ) as SearchProduct[];

  return findSimilarInStockProduct(requested, [...products, ...extra]);
}

/** @deprecated use tryDirectProductReply */
export async function tryDirectSkuProductReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<{ reply: string; products: SearchProduct[] } | null> {
  return tryDirectProductReply(ctx, latestUserMessage, history);
}
