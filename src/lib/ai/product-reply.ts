import {
  extractSkuFromText,
  extractProductSearchQuery,
  getPrimaryProductImageUrl,
  looksLikeCatalogBrowseMoreRequest,
  looksLikeCatalogBrowseRequest,
  productSearchTokens,
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
import { executeSalesTool, type AgentContext } from "./sales-tools";
import { resolveExactDirectRoute } from "./exact-routes";
import {
  extractCatalogBrowseShownProducts,
  looksLikeCatalogProductPick,
  pickBestShownCatalogTitle,
} from "./catalog-browse-pick";
import {
  formatVariantSelectionReply,
  looksLikeVariantSelection,
  matchVariantFromMessage,
  messageMatchesListedProductOption,
  assistantAskedWhichVariant,
} from "./variant-selection";
import {
  looksLikeCheckoutMessage,
} from "./checkout-parse";

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

const IMAGE_ASK_PATTERN =
  /\b(image|images|photo|photos|picture|pictures|pics|pic)\b/i;

const IMAGE_ASK_VERB =
  /\b(send|share|show|see|want|need)\b.*\b(image|images|photo|photos|picture|pictures|pic)\b|\b(image|photo|picture)s?\s+(please|pls|of\s+(it|this|the\s+product))\b/i;

function looksLikeImageRequest(message: string): boolean {
  const t = message.trim();
  if (!IMAGE_ASK_PATTERN.test(t)) return false;
  return (
    IMAGE_ASK_VERB.test(t) ||
    /^(image|photo|picture|pic)s?\??$/i.test(t) ||
    /\b(product|it|this)\b.*\b(image|photo|picture)/i.test(t)
  );
}

function findSkuInConversation(
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): string | null {
  const active = findActiveProductContext(history, latestUserMessage);
  if (active?.sku) return active.sku;
  const fromLatest = extractSkuFromText(latestUserMessage);
  if (fromLatest) return fromLatest;
  return null;
}

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

function pickBestProduct(
  products: SearchProduct[],
  active: ActiveProductContext | null
): SearchProduct {
  if (!products.length) {
    throw new Error("pickBestProduct requires at least one product");
  }
  if (!active || products.length === 1) return products[0];

  if (active.sku) {
    const bySku = products.find(
      (p) => p.sku?.toUpperCase() === active.sku!.toUpperCase()
    );
    if (bySku) return bySku;
  }

  if (active.title) {
    const needle = active.title.toLowerCase();
    const exact = products.find((p) => p.title?.toLowerCase() === needle);
    if (exact) return exact;
    const partial = products.find((p) =>
      p.title?.toLowerCase().includes(needle)
    );
    if (partial) return partial;
    const contained = products.find((p) => {
      const t = p.title?.toLowerCase() ?? "";
      return t.length > 2 && needle.includes(t);
    });
    if (contained) return contained;
  }

  return products[0];
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

function extractRefFromHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): string | null {
  return findActiveProductContext(history)?.ref ?? null;
}

function productDiscussedInHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): boolean {
  return history.some(
    (m) =>
      m.role === "assistant" &&
      (/\[Ref:\s*[^\]]+\]/i.test(m.content) ||
        /(?:—|-)\s*(?:Rs\.?|PKR|AED|\$|€)/i.test(m.content) ||
        /\b(in stock|out of stock)\b/i.test(m.content))
  );
}

/** Answer variant/color/size questions about the product already in chat. */
export function formatProductFollowUpReply(
  product: SearchProduct,
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
  active?: ActiveProductContext | null
): string {
  const ctx = active ?? findActiveProductContext(history, userMessage);
  const askColor = /\b(color|colors|colour|colours)\b/i.test(userMessage);
  const askSize = /\b(size|sizes)\b/i.test(userMessage);

  const options = product.options ?? [];
  const realVariants = meaningfulVariants(product);
  const hasVariants = productHasSelectableVariants(product);
  const refId =
    !hasVariants
      ? ctx?.ref ||
        realVariants[0]?.id ||
        product.variants?.[0]?.id ||
        null
      : null;

  const title = product.title || ctx?.title || "this product";
  const prefix = refId ? `[Ref: ${refId}]\n` : "";
  const imagePrefix = productImageLine(product);

  if (!hasVariants) {
    return `${imagePrefix}${prefix}Just one version for ${title} — no extra options 👍`;
  }

  const colorOption = options.find((o) =>
    /color|colour/i.test(o.name ?? "")
  );
  const sizeOption = options.find((o) => /size/i.test(o.name ?? ""));

  if (askColor) {
    if (colorOption?.values?.length) {
      const vals = colorOption.values.slice(0, 8).join(", ");
      return `${prefix}Yes — ${title} comes in: ${vals}.\nWhich color do you want?`;
    }
    const fromVariants = [
      ...new Set(
        realVariants
          .map(
            (v) =>
              v.option_values?.Color ||
              v.option_values?.Colour ||
              v.option_values?.color ||
              v.option_values?.colour
          )
          .filter(Boolean)
      ),
    ] as string[];
    if (fromVariants.length > 1) {
      return `${prefix}Color options: ${fromVariants.join(", ")}.\nWhich one?`;
    }
    return `${prefix}This one only comes in a single version — no color options for ${title} 👍`;
  }

  if (askSize) {
    if (sizeOption?.values?.length) {
      return `${prefix}Sizes: ${sizeOption.values.slice(0, 8).join(", ")}.\nWhich size?`;
    }
    const fromVariants = [
      ...new Set(
        realVariants
          .map((v) => v.option_values?.Size || v.option_values?.size)
          .filter(Boolean)
      ),
    ] as string[];
    if (fromVariants.length > 1) {
      return `${prefix}Sizes: ${fromVariants.join(", ")}.\nWhich size?`;
    }
    return `${prefix}Just one size for ${title} — no size options 👍`;
  }

  if (options.length) {
    const lines = options
      .slice(0, 4)
      .map((o) => `${o.name}: ${(o.values ?? []).slice(0, 6).join(", ")}`);
    return `${imagePrefix}${prefix}${lines.join("\n")}\n\nWhich option do you need?`;
  }

  if (realVariants.length > 1) {
    const lines = realVariants.slice(0, 6).map((v) => {
      const price = v.price_formatted ? ` — ${v.price_formatted}` : "";
      return `• ${v.title}${price}`;
    });
    return `${imagePrefix}${prefix}Options:\n${lines.join("\n")}\n\nWhich one?`;
  }

  return `${imagePrefix}${prefix}Which option do you need?`;
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

function findProductTitleInHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): string | null {
  return findActiveProductContext(history)?.title ?? null;
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

  if (products.length > 1) {
    return `${body}\n\n${pickLine}\n\n${moreLine}`;
  }

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

/** Show catalog picks when the customer asks what they can buy; paginate on "more/other". */
export async function tryDirectCatalogBrowseReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<string | null> {
  const isMore = looksLikeCatalogBrowseMoreRequest(latestUserMessage, history);
  const isBrowse = looksLikeCatalogBrowseRequest(latestUserMessage);
  if (!isBrowse && !isMore) return null;

  const built = await buildCatalogBrowseReplyForAgent(ctx, history, { isMore });
  if (!built) {
    return "Our catalog is being updated — send a product name or SKU and I'll look it up for you.";
  }
  return built.reply;
}

/** Customer picked a product from a recent catalog browse reply. */
export async function tryDirectCatalogProductPickReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<string | null> {
  if (looksLikeCheckoutMessage(latestUserMessage, history)) return null;
  if (looksLikeVariantSelection(latestUserMessage, history)) return null;
  if (!looksLikeCatalogProductPick(latestUserMessage, history)) return null;

  const { titles } = extractCatalogBrowseShownProducts(history);
  const query =
    pickBestShownCatalogTitle(latestUserMessage, titles) ||
    extractProductSearchQuery(latestUserMessage);
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

  const relevant = filterRelevantProducts(products, query);
  if (!relevant.length) {
    return formatProductNotFoundReply(query);
  }

  const product = pickBestProduct(relevant, {
    title: query,
    sku: null,
    ref: null,
  });

  return `${formatSingleProductBlock(product)}\n\n${productCloseLine(product)}`;
}

function formatProductNotFoundReply(query: string): string {
  const label = query.trim() || "that";
  return [
    `I couldn't find *${label}* in our catalog.`,
    `Try a different spelling, another product name, or send a SKU and I'll look again.`,
  ].join("\n");
}

function productSkuMatches(product: SearchProduct, skuHint: string): boolean {
  const key = skuMatchKey(skuHint);
  if (!key) return false;
  if (product.sku && skuMatchKey(product.sku) === key) return true;
  return (product.variants ?? []).some(
    (v) => v.sku && skuMatchKey(v.sku) === key
  );
}

/** Drop fuzzy catalog noise when nothing actually matches the customer's words. */
function productMatchesQuery(product: SearchProduct, query: string): boolean {
  const skuHint = extractSkuFromText(query);
  if (skuHint && productSkuMatches(product, skuHint)) return true;

  const tokens = productSearchTokens(query);
  if (!tokens.length) return true;

  const hay = skuMatchKey(
    `${product.title ?? ""} ${product.sku ?? ""} ${product.description ?? ""}`
  );

  const hits = tokens.filter((token) => {
    const t = skuMatchKey(token);
    return t.length >= 2 && hay.includes(t);
  });

  if (tokens.some((t) => t.length >= 4 && hay.includes(skuMatchKey(t)))) {
    return true;
  }

  return hits.length >= Math.max(1, Math.ceil(tokens.length * 0.5));
}

function filterRelevantProducts(
  products: SearchProduct[],
  query: string
): SearchProduct[] {
  const skuHint = extractSkuFromText(query);
  if (skuHint) {
    const exact = products.filter((p) => productSkuMatches(p, skuHint));
    if (exact.length) return exact;
  }
  return products.filter((p) => productMatchesQuery(p, query));
}

function shouldTryDirectProductLookup(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): boolean {
  if (looksLikeCheckoutMessage(message, history)) return false;
  if (looksLikeVariantSelection(message, history)) return false;

  const route = resolveExactDirectRoute(message, history);
  return (
    route === "sku_search" ||
    route === "named_product_search" ||
    route === "catalog_product_pick"
  );
}

/** True when the message is asking about a product (used to skip generic opening messages). */
export function looksLikeProductInquiry(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): boolean {
  return shouldTryDirectProductLookup(message, history);
}

/** User chose a color/size variant for a product already in the chat. */
export async function tryDirectVariantSelectionReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string | null> {
  if (!looksLikeVariantSelection(latestUserMessage, history)) return null;

  const active = findActiveProductContext(history, latestUserMessage);
  const query = active?.sku || active?.title;
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

  if (!products.length) return null;

  const product = pickBestProduct(products, active);
  const hasVariants =
    productHasSelectableVariants(product) ||
    messageMatchesListedProductOption(latestUserMessage, history) ||
    assistantAskedWhichVariant(history);

  if (!hasVariants) return null;

  const variant = matchVariantFromMessage(product, latestUserMessage);

  if (!variant?.id) {
    const opts = (product.options ?? [])
      .map((o) => `${o.name}: ${(o.values ?? []).slice(0, 8).join(", ")}`)
      .join("\n");
    const title = product.title ?? "this product";
    return opts
      ? `Which option for ${title}?\n${opts}\nReply with the color or size you want.`
      : `Which version of ${title} do you want? Reply with the color or size.`;
  }

  return formatVariantSelectionReply(product, variant, ctx.storeCurrency);
}

/**
 * Look up catalog by SKU or product name (full/partial) and answer with details + variants.
 * Uses chat history for follow-ups like "does it have different colors?"
 */
export async function tryDirectProductReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<{ reply: string; products: SearchProduct[] } | null> {
  if (looksLikeCheckoutMessage(latestUserMessage, history)) return null;
  if (looksLikeVariantSelection(latestUserMessage, history)) return null;

  const followUp =
    looksLikeProductFollowUp(latestUserMessage) &&
    productDiscussedInHistory(history);

  if (!shouldTryDirectProductLookup(latestUserMessage, history) && !followUp) {
    return null;
  }

  const active = findActiveProductContext(history, latestUserMessage);
  const sku = extractSkuFromText(latestUserMessage) || active?.sku || null;
  const title = active?.title ?? null;

  let query = sku || extractProductSearchQuery(latestUserMessage);
  if (!query && followUp) {
    query = title || sku;
  }
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
    if (sku) {
      return {
        reply: `I couldn't find a product with SKU ${sku}. Please double-check the code or tell me the product name.`,
        products: [],
      };
    }
    if (followUp && title) {
      return {
        reply:
          "I'm not seeing that product in the catalog anymore — send the name or SKU again?",
        products: [],
      };
    }
    return {
      reply: formatProductNotFoundReply(query),
      products: [],
    };
  }

  const relevant = filterRelevantProducts(products, query);
  if (!relevant.length) {
    if (looksLikeVariantSelection(latestUserMessage, history) && products.length) {
      const product = pickBestProduct(products, active);
      const variant = matchVariantFromMessage(product, latestUserMessage);
      if (variant?.id) {
        return {
          reply: formatVariantSelectionReply(product, variant, ctx.storeCurrency),
          products: [product],
        };
      }
    }
    return {
      reply: formatProductNotFoundReply(query),
      products: [],
    };
  }

  const product = pickBestProduct(relevant, active);

  if (followUp) {
    return {
      reply: formatProductFollowUpReply(
        product,
        latestUserMessage,
        history,
        active
      ),
      products: [product],
    };
  }

  return { reply: formatProductsReply([product]), products: [product] };
}

/** Re-send product photo from catalog when customer asks for images. */
export async function tryDirectProductImageReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string | null> {
  if (!looksLikeImageRequest(latestUserMessage)) return null;

  const active = findActiveProductContext(history, latestUserMessage);
  const query =
    extractSkuFromText(latestUserMessage) || active?.title || active?.sku;
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

  if (!products.length) return null;

  const product = pickBestProduct(products, active);
  const imageUrl = getPrimaryProductImageUrl(product);
  const quoted = extractLatestQuotedPrice(history);
  const label = product.title || active?.title || "this one";

  if (!imageUrl) {
    return quoted
      ? `Don't have a photo handy for ${label} right now — but your price is still ${quoted} 👍`
      : null;
  }

  const caption = quoted
    ? `Here's ${label} — still at ${quoted} for you 👍`
    : `Here's ${label} 👍`;

  return `[Image: ${imageUrl}]\n${caption}`;
}

/** @deprecated use tryDirectProductReply */
export async function tryDirectSkuProductReply(
  ctx: AgentContext,
  latestUserMessage: string
): Promise<{ reply: string; products: SearchProduct[] } | null> {
  return tryDirectProductReply(ctx, latestUserMessage);
}
