import {
  extractSkuFromText,
  extractProductSearchQuery,
  getPrimaryProductImageUrl,
  sampleActiveCatalogProducts,
  skuMatchKey,
  CATALOG_BROWSE_INTRO,
  CATALOG_BROWSE_MORE_INTRO,
  type PortalProductSearchHit,
} from "@/lib/products/products-service";
import {
  isPlaceholderVariantTitle,
  isRealVariantTitle,
  productHasSelectableVariants,
} from "@/lib/products/variant-titles";
import { getShopCurrency, listShopifyCatalogProducts } from "@/lib/shopify";
import { formatMoney } from "@/lib/currency";
import { type AgentContext } from "./sales-tools";
import { extractCatalogBrowseShownProducts } from "./catalog-browse-pick";

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

export type ActiveProductContext = {
  title: string | null;
  sku: string | null;
  ref: string | null;
};

function isProductPitchMessage(content: string): boolean {
  return (
    /\[Ref:\s*[^\]]+\]/i.test(content) ||
    /(?:^|\n)[^\n]+(?:—|-)\s*(?:Rs\.?|PKR|AED|\$|€)/im.test(content) ||
    /\b(in stock|out of stock)\b/i.test(content)
  );
}

function refFromContent(content: string): string | null {
  return content.match(/\[Ref:\s*([0-9a-f-]{36}|\d{5,})\]/i)?.[1] ?? null;
}

function titleFromPitch(content: string): string | null {
  const withoutRef = content.replace(/^\s*\[Ref:[^\]]+\]\s*\n?/i, "");
  const dashLine = withoutRef.match(
    /(?:^|\n)([^\n]+?)\s*(?:—|-)\s*(?:Rs\.?|PKR|AED|\$|€)/im
  );
  if (dashLine?.[1]) {
    const t = dashLine[1].replace(/\*([^*]+)\*/g, "$1").trim();
    if (t.length >= 2 && t.length <= 80 && !/^(Want it|Which size)/i.test(t)) {
      return t;
    }
  }
  return null;
}

function isCatalogBrowseMessage(content: string): boolean {
  return (
    CATALOG_BROWSE_INTRO.test(content) || CATALOG_BROWSE_MORE_INTRO.test(content)
  );
}

const VARIANT_FOLLOW_UP_PATTERN =
  /\b(color|colors|colour|colours|size|sizes|variant|variants|option|options|different|other)\b/i;

function looksLikeProductFollowUp(message: string): boolean {
  const t = message.trim();
  if (t.length < 3 || t.length > 140) return false;
  if (!VARIANT_FOLLOW_UP_PATTERN.test(t)) return false;
  if (/^(what|which|any|how many)\b/i.test(t)) return true;
  if (/\b(it|this|that|the product|same)\b/i.test(t)) return true;
  if (/^(do(es)?|is there|are there|can i|have you)\b/i.test(t)) return true;
  if (/^(color|size|variant)s?\??$/i.test(t)) return true;
  return false;
}

/** Most recently discussed product in this chat — not older products from earlier in the session. */
export function findActiveProductContext(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  latestUserMessage?: string
): ActiveProductContext | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== "assistant" || !isProductPitchMessage(msg.content)) {
      continue;
    }
    if (isCatalogBrowseMessage(msg.content)) continue;

    let userTitle: string | null = null;
    for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
      if (history[j].role !== "user") continue;
      if (looksLikeProductFollowUp(history[j].content)) continue;
      userTitle = extractProductSearchQuery(history[j].content);
      if (userTitle) break;
    }

    return {
      title: titleFromPitch(msg.content) || userTitle,
      sku: extractSkuFromText(msg.content),
      ref: refFromContent(msg.content),
    };
  }

  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "user") continue;
    if (looksLikeProductFollowUp(history[i].content)) continue;
    const sku = extractSkuFromText(history[i].content);
    const title = extractProductSearchQuery(history[i].content);
    if (sku || title) {
      return { title, sku, ref: null };
    }
  }

  if (latestUserMessage) {
    const sku = extractSkuFromText(latestUserMessage);
    const title = extractProductSearchQuery(latestUserMessage);
    if (sku || title) {
      return { title, sku, ref: null };
    }
  }

  return null;
}

/** Latest price mentioned by the assistant (incl. recovery offers). */
export function extractLatestQuotedPrice(
  history: Array<{ role: "user" | "assistant"; content: string }>
): string | null {
  for (const msg of [...history].reverse()) {
    if (msg.role !== "assistant") continue;
    const c = msg.content;

    const offerNow = c.match(/instead of [~*][^~*\n]+[~*][^*\n]*\*([^*]+)\*/i);
    if (offerNow?.[1]) return offerNow[1].trim();

    const boldPrice = c.match(/\*(Rs\.?|PKR|AED|\$|€|USD)\s*[\d,]+(?:\.\d+)?[^*]*\*/i);
    if (boldPrice?.[0]) return boldPrice[0].replace(/\*/g, "").trim();

    const dashPrice = c.match(
      /(?:^|\n)[^\n]+(?:—|-)\s*((?:Rs\.?|PKR|AED|\$|€)\s*[\d,]+(?:\.\d+)?)/im
    );
    if (dashPrice?.[1]) return dashPrice[1].trim();

    const priceLine = c.match(/(?:Price|From):\s*([^\n]+)/i);
    if (priceLine?.[1] && !/see store for price/i.test(priceLine[1])) {
      return priceLine[1].trim();
    }
  }
  return null;
}

function productImageLine(product: SearchProduct): string {
  const url = getPrimaryProductImageUrl(product);
  return url ? `[Image: ${url}]\n` : "";
}

function meaningfulVariants(product: SearchProduct) {
  return (product.variants ?? []).filter((v) =>
    isRealVariantTitle(v.title ?? null)
  );
}

function formatVariantPriceLabel(variant: {
  price_formatted?: string;
}): string | null {
  const raw = variant.price_formatted;
  if (!raw || /see store for price/i.test(raw) || raw === "0") return null;
  return raw;
}

function buildOptionsLine(p: SearchProduct): string | null {
  const parts = (p.options ?? [])
    .filter((o) => o.name && (o.values?.length ?? 0) > 0)
    .slice(0, 3)
    .map((o) => `${o.name}: ${(o.values ?? []).slice(0, 8).join(", ")}`);
  return parts.length ? `Options: ${parts.join(" · ")}` : null;
}

function productCloseLine(p: SearchProduct): string {
  return productHasSelectableVariants(p)
    ? "Which size/color do you need?"
    : "Want it? Share your phone & delivery address.";
}

export function portalHitToSearchProduct(hit: PortalProductSearchHit): SearchProduct {
  return {
    title: hit.title,
    sku: hit.sku,
    description: hit.description,
    imageUrl: hit.imageUrl,
    image_urls: hit.image_urls,
    options: hit.options,
    variants:
      hit.variants.length > 0
        ? hit.variants.map((v) => ({
            id: v.id,
            title: v.title,
            sku: v.sku,
            price_formatted: formatMoney(Number(v.price), hit.currency),
            option_values: v.option_values,
          }))
        : [
            {
              id: hit.id,
              title: "Default",
              sku: hit.sku,
              price_formatted: formatMoney(Number(hit.price), hit.currency),
            },
          ],
    bundles: hit.bundles.map((b) => ({
      quantity: b.quantity,
      price_formatted: formatMoney(Number(b.price), hit.currency),
      label: b.label,
    })),
  };
}

/** WhatsApp product card with image marker, ref, and closing prompt. */
export function formatProductCardForWhatsApp(
  product: SearchProduct,
  options?: { variantId?: string }
): string {
  let block = formatSingleProductBlock(product);
  const variantId = options?.variantId?.trim();
  if (variantId) {
    if (/\[Ref:\s*[^\]]+\]/i.test(block)) {
      block = block.replace(/\[Ref:\s*[^\]]+\]/i, `[Ref: ${variantId}]`);
    } else {
      block = block.replace(
        /^(\[Image:[^\]]+\]\n)?/i,
        `$1[Ref: ${variantId}]\n`
      );
    }
  }
  return `${block}\n\n${productCloseLine(product)}`;
}

/** Build one product card — price shown once, image when available. */
function formatSingleProductBlock(p: SearchProduct): string {
  const imageLine = productImageLine(p);
  const hasVariants = productHasSelectableVariants(p);
  const meaningful = meaningfulVariants(p);
  const allVariants = p.variants ?? [];
  const defaultVariant =
    allVariants.find((v) => isPlaceholderVariantTitle(v.title)) ??
    allVariants[0];

  const priceSource = meaningful[0] ?? defaultVariant;
  const basePrice = priceSource ? formatVariantPriceLabel(priceSource) : null;

  const refId = !hasVariants
    ? meaningful[0]?.id || defaultVariant?.id || null
    : meaningful.length === 1
      ? meaningful[0]?.id || null
      : null;

  const optionsLine = hasVariants ? buildOptionsLine(p) : null;
  const showVariantBullets =
    hasVariants && !optionsLine && meaningful.length > 1;

  const titleLine =
    showVariantBullets && basePrice
      ? `${p.title || "Product"}`
      : `${p.title || "Product"}${basePrice ? ` — ${basePrice}` : ""}`;

  const variantLines = showVariantBullets
    ? meaningful.slice(0, 6).map((v) => {
        const label = v.title || "Variant";
        const price = formatVariantPriceLabel(v);
        return `• ${label}${price ? ` — ${price}` : ""}`;
      })
    : [];

  const body = [
    refId ? `[Ref: ${refId}]` : null,
    titleLine,
    optionsLine,
    variantLines.length ? variantLines.join("\n") : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${imageLine}${body}`;
}

/** Format catalog hits into a short WhatsApp product answer. */
export function formatProductsReply(products: SearchProduct[]): string {
  if (!products.length) {
    return "Couldn't find that product. Send the name or SKU again?";
  }

  const blocks = products.slice(0, 2).map((p) => formatSingleProductBlock(p));

  if (products.length > 1) {
    return `${blocks.join("\n\n")}\n\nI found a couple matches — which one did you mean?`;
  }

  return `${blocks[0]}\n\n${productCloseLine(products[0]!)}`;
}

function formatCatalogBrowseReply(products: SearchProduct[]): string {
  const blocks = products.slice(0, 2).map((p) => formatSingleProductBlock(p));
  const pickLine =
    products.length > 1
      ? "Which one interests you?"
      : productCloseLine(products[0]!);
  const moreLine = "Say *more* or *other* to see different products.";
  const body = blocks.join("\n\n");

  return `${body}\n\n${pickLine}\n\n${moreLine}`;
}

async function loadCatalogSampleProducts(
  ctx: AgentContext,
  count = 2,
  exclude?: { skus: string[]; titles: string[] }
): Promise<SearchProduct[]> {
  const portalHits = await sampleActiveCatalogProducts(ctx.store.id, count, {
    excludeSkus: exclude?.skus,
    excludeTitles: exclude?.titles,
  });
  const mapped: SearchProduct[] = portalHits.map((hit) => ({
    title: hit.title,
    sku: hit.sku,
    description: hit.description,
    imageUrl: hit.imageUrl,
    image_urls: hit.image_urls,
    options: hit.options,
    variants:
      hit.variants.length > 0
        ? hit.variants.map((v) => ({
            id: v.id,
            title: v.title,
            sku: v.sku,
            price_formatted: formatMoney(Number(v.price), hit.currency),
          }))
        : [
            {
              id: hit.id,
              title: "Default",
              price_formatted: formatMoney(Number(hit.price), hit.currency),
            },
          ],
  }));

  if (mapped.length >= count) return mapped.slice(0, count);

  const shopDomain = ctx.store.shop_domain;
  const token = ctx.store.shopify_access_token;
  if (!shopDomain || !token) return mapped;

  try {
    let currency = ctx.storeCurrency;
    if (!currency) {
      currency = await getShopCurrency(shopDomain, token);
    }
    const { products } = await listShopifyCatalogProducts(shopDomain, token, {
      limit: 30,
    });
    const excludeSku = new Set(
      (exclude?.skus ?? []).map((s) => skuMatchKey(s)).filter(Boolean)
    );
    const excludeTitle = new Set(
      (exclude?.titles ?? []).map((s) => skuMatchKey(s)).filter(Boolean)
    );
    const portalKeys = new Set(
      mapped.flatMap((p) => [
        p.sku ? skuMatchKey(p.sku) : "",
        p.title ? skuMatchKey(p.title) : "",
      ]).filter(Boolean)
    );

    const sorted = [...products].sort((a, b) =>
      (a.title ?? "").localeCompare(b.title ?? "")
    );

    for (const p of sorted) {
      if (mapped.length >= count) break;
      const titleKey = p.title ? skuMatchKey(p.title) : "";
      if (titleKey && (excludeTitle.has(titleKey) || portalKeys.has(titleKey))) {
        continue;
      }
      const price = p.priceFrom ?? "0";
      const productCurrency = p.currency ?? currency ?? "USD";
      mapped.push({
        title: p.title,
        description: p.description,
        imageUrl: p.imageUrl,
        variants: [
          {
            id: String(p.id),
            title: "Default",
            price_formatted: formatMoney(Number(price), productCurrency),
          },
        ],
      });
    }
  } catch (err) {
    console.error("[catalog-browse] shopify sample failed:", err);
  }

  return mapped.slice(0, count);
}

/** Build catalog browse reply for AI tools (no regex gate). */
export async function buildCatalogBrowseReplyForAgent(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  options?: { isMore?: boolean }
): Promise<{ products: SearchProduct[]; reply: string } | null> {
  const isMore = options?.isMore ?? false;
  const shown = extractCatalogBrowseShownProducts(history);
  const products = await loadCatalogSampleProducts(ctx, 2, shown);

  if (!products.length) {
    if (isMore) {
      return {
        products: [],
        reply:
          "That's everything in our catalog right now 👍 Reply with a product name from above, or send a SKU.",
      };
    }
    return null;
  }

  const intro = isMore
    ? "Here are a couple more you can order 👇"
    : "Here are a couple of things you can order from us 👇";

  return {
    products,
    reply: `${intro}\n\n${formatCatalogBrowseReply(products)}`,
  };
}
