import {
  extractSkuFromText,
  extractProductSearchQuery,
  getPrimaryProductImageUrl,
} from "@/lib/products/products-service";
import { executeSalesTool, type AgentContext } from "./sales-tools";
import { parseCheckoutDetails } from "./checkout-parse";

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
  const fromLatest = extractSkuFromText(latestUserMessage);
  if (fromLatest) return fromLatest;
  for (let i = history.length - 1; i >= 0; i--) {
    const sku = extractSkuFromText(history[i].content);
    if (sku) return sku;
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
  for (let i = history.length - 1; i >= 0; i--) {
    const m =
      history[i].content.match(/\[Ref:\s*([0-9a-f-]{36}|\d{5,})\]/i)?.[1] ||
      history[i].content.match(/\bRef:\s*([0-9a-f-]{36}|\d{5,})\b/i)?.[1];
    if (m) return m;
  }
  return null;
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
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): string {
  const askColor = /\b(color|colors|colour|colours)\b/i.test(userMessage);
  const askSize = /\b(size|sizes)\b/i.test(userMessage);

  const options = product.options ?? [];
  const realVariants = (product.variants ?? []).filter(
    (v) => v.title && v.title !== "Default"
  );
  const refId =
    extractRefFromHistory(history) ||
    realVariants[0]?.id ||
    product.variants?.[0]?.id ||
    null;

  const title = product.title || "this product";
  const prefix = refId ? `[Ref: ${refId}]\n` : "";

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
    return `${prefix}${lines.join("\n")}\n\nWhich option do you need?`;
  }

  if (realVariants.length > 1) {
    const lines = realVariants.slice(0, 6).map((v) => {
      const price = v.price_formatted ? ` — ${v.price_formatted}` : "";
      return `• ${v.title}${price}`;
    });
    return `${prefix}Options:\n${lines.join("\n")}\n\nWhich one?`;
  }

  return `${prefix}Just one version for ${title} — no extra color/size options 👍`;
}

function findProductTitleInHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): string | null {
  for (const msg of [...history].reverse()) {
    if (msg.role !== "assistant") continue;
    const line = msg.content
      .split("\n")
      .map((l) => l.trim())
      .find(
        (l) =>
          l &&
          !/^\[/.test(l) &&
          !/^(Want it|Which size|Options:|In stock|Out of stock)/i.test(l) &&
          l.length <= 80
      );
    if (line) {
      return line.replace(/\*([^*]+)\*/g, "$1").split("—")[0]?.trim() || null;
    }
  }
  return null;
}

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
        ? realVariants.slice(0, 3).map((v) => {
            const label = v.title || "Variant";
            const price = v.price_formatted ? ` — ${v.price_formatted}` : "";
            const stock = v.in_stock === false ? " (out of stock)" : "";
            return `• ${label}${price}${stock}`;
          })
        : [];

    const outOfStock =
      realVariants.length > 0 &&
      realVariants.every((v) => v.in_stock === false);

    return [
      refId ? `[Ref: ${refId}]` : null,
      `${p.title || "Product"}${basePrice ? ` — ${basePrice}` : ""}`,
      outOfStock ? "Out of stock right now" : "In stock",
      optionsLine ? `Options: ${optionsLine}` : null,
      variantLines.length === 1 ? variantLines[0].replace(/^•\s*/, "") : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const multi =
    products.length > 1
      ? `\n\nI found a couple matches — which one did you mean?`
      : "";

  const hasVariants = products.some((p) =>
    (p.variants ?? []).some((v) => v.title && v.title !== "Default")
  );

  const prefix = imageMarkers.length ? `${imageMarkers.join("\n")}\n` : "";

  const closeLine = hasVariants
    ? "Which size/color do you need?"
    : "Want it? Share name, phone & delivery address.";

  return `${prefix}${blocks.join("\n\n")}${multi}${multi ? "" : `\n\n${closeLine}`}`;
}

function shouldTryDirectProductLookup(message: string): boolean {
  const t = message.trim();
  if (t.length < 2) return false;
  if (GREETING_ONLY.test(t)) return false;
  // Full contact block → checkout handler, not catalog lookup
  if (parseCheckoutDetails(t)) return false;
  if (CHECKOUT_HIJACK.test(t) && /\d{8,}/.test(t.replace(/\D/g, ""))) {
    return false;
  }
  if (CHECKOUT_HIJACK.test(t) && /\b(name|address|phone)\b/i.test(t)) {
    return false;
  }
  if (ORDER_ONLY_PATTERN.test(t) && !PRODUCT_ASK_PATTERN.test(t)) return false;
  // SKU always wins — even if they say "I want to order AA-…"
  if (extractSkuFromText(t)) return true;
  if (PRODUCT_ASK_PATTERN.test(t) && !CHECKOUT_HIJACK.test(t)) return true;
  const query = extractProductSearchQuery(t);
  if (!query) return false;
  if (t.length <= 80 && !ORDER_ONLY_PATTERN.test(t) && !CHECKOUT_HIJACK.test(t)) {
    return true;
  }
  return false;
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
  const followUp =
    looksLikeProductFollowUp(latestUserMessage) &&
    productDiscussedInHistory(history);

  if (!shouldTryDirectProductLookup(latestUserMessage) && !followUp) {
    return null;
  }

  const sku =
    extractSkuFromText(latestUserMessage) ||
    (history.length ? findSkuInConversation(latestUserMessage, history) : null);
  const title = history.length ? findProductTitleInHistory(history) : null;

  let query = sku || extractProductSearchQuery(latestUserMessage);
  if (!query && followUp) {
    query = sku || title;
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
    return null;
  }

  if (followUp) {
    return {
      reply: formatProductFollowUpReply(products[0], latestUserMessage, history),
      products,
    };
  }

  return { reply: formatProductsReply(products), products };
}

/** Re-send product photo from catalog when customer asks for images. */
export async function tryDirectProductImageReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string | null> {
  if (!looksLikeImageRequest(latestUserMessage)) return null;

  const sku = findSkuInConversation(latestUserMessage, history);
  const title = findProductTitleInHistory(history);
  const query = sku || title;
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

  const product = products[0];
  const imageUrl = getPrimaryProductImageUrl(product);
  const quoted = extractLatestQuotedPrice(history);
  const label = product.title || title || "this one";

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
