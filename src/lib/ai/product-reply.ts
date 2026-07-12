import {
  extractSkuFromText,
  extractProductSearchQuery,
  getPrimaryProductImageUrl,
} from "@/lib/products/products-service";
import { executeSalesTool, type AgentContext } from "./sales-tools";
import { orderDetailsTemplate } from "./order-details-template";

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

const GREETING_ONLY =
  /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|assalam|salam)[\s!.]*$/i;

const CHECKOUT_HIJACK =
  /\b(place\s+(an\s+)?order|want\s+to\s+(order|buy)|my name|address|phone|checkout|deliver)\b/i;

/** Format catalog hits into a short WhatsApp product answer. */
export function formatProductsReply(products: SearchProduct[]): string {
  if (!products.length) {
    return "Couldn't find that product. Send the name or SKU again?";
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
            const label = v.title || "Variant";
            const price = v.price_formatted ? ` — ${v.price_formatted}` : "";
            const stock = v.in_stock === false ? " (out of stock)" : "";
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
      p.sku ? `SKU: ${p.sku}` : null,
      basePrice ? `Price: ${basePrice}` : null,
      outOfStock ? `Stock: out of stock` : `Stock: available`,
      optionsLine ? optionsLine : null,
      variantLines.length ? variantLines.join("\n") : null,
      bundleLines.length ? `Bundles:\n${bundleLines.join("\n")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const multi =
    products.length > 1
      ? `\n\nFound ${Math.min(products.length, 2)} matches — which one?`
      : "";

  const hasVariants = products.some((p) =>
    (p.variants ?? []).some((v) => v.title && v.title !== "Default")
  );

  const prefix = imageMarkers.length ? `${imageMarkers.join("\n")}\n` : "";

  return `${prefix}${blocks.join("\n\n")}${multi}\n\nWant to order?\n${orderDetailsTemplate(
    { includeVariantHint: hasVariants }
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
  if (extractSkuFromText(t) && !CHECKOUT_HIJACK.test(t)) return true;
  if (PRODUCT_ASK_PATTERN.test(t) && !CHECKOUT_HIJACK.test(t)) return true;
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
  latestUserMessage: string
): Promise<{ reply: string; products: SearchProduct[] } | null> {
  if (!shouldTryDirectProductLookup(latestUserMessage)) return null;

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
        reply: `I couldn't find a product with SKU ${sku}. Please double-check the code or tell me the product name.`,
        products: [],
      };
    }
    return null;
  }

  return { reply: formatProductsReply(products), products };
}

/** @deprecated use tryDirectProductReply */
export async function tryDirectSkuProductReply(
  ctx: AgentContext,
  latestUserMessage: string
): Promise<{ reply: string; products: SearchProduct[] } | null> {
  return tryDirectProductReply(ctx, latestUserMessage);
}
