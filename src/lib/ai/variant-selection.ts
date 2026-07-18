import { isRealVariantTitle } from "@/lib/products/variant-titles";
import { looksLikeCatalogProductPick } from "./catalog-browse-pick";

type VariantRow = {
  id?: string;
  title?: string;
  sku?: string | null;
  price?: string;
  price_formatted?: string;
  option_values?: Record<string, string>;
};

type ProductWithVariants = {
  title?: string;
  sku?: string;
  imageUrl?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  options?: Array<{ name?: string; values?: string[] }>;
  variants?: VariantRow[];
};

const VARIANT_WORDS =
  /\b(color|colors|colour|colours|size|sizes|variant|variants|option|options)\b/i;

const FILLER =
  /\b(i|want|to|order|buy|in|the|a|an|please|this|that|one|need|get|take|with|for|me|is|it|do|you|have|can|would|like)\b/gi;

export function assistantAskedWhichVariant(
  history: Array<{ role: "user" | "assistant"; content: string }>
): boolean {
  const recent = history
    .filter((m) => m.role === "assistant")
    .slice(-8)
    .map((m) => m.content)
    .join("\n");
  return (
    /which (color|colour|size|variant|option)\b/i.test(recent) ||
    /which size\/color/i.test(recent) ||
    /which version of/i.test(recent) ||
    /Options:\s*(Color|Colour|Size)/i.test(recent) ||
    /Reply with the color or size/i.test(recent) ||
    /comes in:/i.test(recent)
  );
}

function listedOptionValuesInHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): string[] {
  for (const msg of [...history].reverse().slice(0, 12)) {
    if (msg.role !== "assistant") continue;
    const match = msg.content.match(/Options:\s*([^\n]+)/i);
    if (!match?.[1]) continue;

    const segment = match[1].replace(/^[^:]+:\s*/, "");
    const values = segment
      .split(/[,/|·]/)
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length >= 2 && part.length <= 40);

    if (values.length) return values;
  }
  return [];
}

/** User replied with a color/size value the bot just listed. */
export function messageMatchesListedProductOption(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): boolean {
  const t = message.trim().toLowerCase();
  if (t.length < 2 || t.length > 40) return false;

  const listed = listedOptionValuesInHistory(history);
  if (!listed.length) return false;

  return listed.some(
    (value) => value === t || value.includes(t) || t.includes(value)
  );
}

/** User is picking a color/size/variant for a product already shown in chat. */
export function looksLikeVariantSelection(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): boolean {
  const t = message.trim();
  if (t.length < 2 || t.length > 140) return false;

  const discussed = history.some(
    (m) =>
      m.role === "assistant" &&
      (/\[Ref:\s*[^\]]+\]/i.test(m.content) ||
        /Options:\s*/i.test(m.content) ||
        /(?:—|-)\s*(?:Rs\.?|PKR|AED|\$|€)/i.test(m.content))
  );
  if (!discussed) return false;

  if (messageMatchesListedProductOption(t, history)) return true;

  if (looksLikeCatalogProductPick(t, history)) return false;

  if (assistantAskedWhichVariant(history) && t.split(/\s+/).length <= 6) {
    return true;
  }

  if (!VARIANT_WORDS.test(t)) return false;

  if (
    assistantAskedWhichVariant(history) &&
    /\b(want|order|buy|take|get|need)\b/i.test(t)
  ) {
    return true;
  }
  if (/\b(in|the)\s+\w+\s+(color|colour|size)\b/i.test(t)) return true;
  return false;
}

function selectionTokens(message: string): string[] {
  const cleaned = message
    .replace(FILLER, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return cleaned
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

function variantHaystack(variant: VariantRow): string {
  const parts = [variant.title ?? "", ...Object.values(variant.option_values ?? {})];
  return parts.join(" ").toLowerCase();
}

export function matchVariantFromMessage(
  product: ProductWithVariants,
  message: string
): VariantRow | null {
  const tokens = selectionTokens(message);
  if (!tokens.length) return null;

  const realVariants = (product.variants ?? []).filter((v) =>
    isRealVariantTitle(v.title ?? null)
  );
  if (!realVariants.length) return null;

  let best: VariantRow | null = null;
  let bestScore = 0;

  for (const variant of realVariants) {
    const hay = variantHaystack(variant);
    let score = 0;
    for (const token of tokens) {
      if (hay === token) score += 5;
      else if (hay.includes(token) || token.includes(hay)) score += 3;
      else if (hay.split(/\s*\/\s*/).some((part) => part.trim() === token)) {
        score += 4;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = variant;
    }
  }

  if (best && bestScore >= 3) return best;

  for (const opt of product.options ?? []) {
    for (const value of opt.values ?? []) {
      const valLower = value.toLowerCase();
      if (!tokens.some((t) => valLower.includes(t) || t.includes(valLower))) {
        if (valLower !== message.trim().toLowerCase()) continue;
      }
      const match = realVariants.find((v) => {
        const hay = variantHaystack(v);
        return hay.includes(valLower);
      });
      if (match) return match;
    }
  }

  return null;
}

export function formatVariantSelectionReply(
  product: ProductWithVariants,
  variant: VariantRow,
  currency?: string | null
): string {
  const title = product.title ?? "Product";
  const variantLabel =
    variant.title && isRealVariantTitle(variant.title)
      ? variant.title
      : title;
  const price =
    variant.price_formatted ??
    (variant.price && currency ? `${variant.price} ${currency}` : variant.price);

  const imageUrl =
    product.imageUrl ??
    product.image_url ??
    product.image_urls?.[0] ??
    null;
  const imageLine = imageUrl ? `[Image: ${imageUrl}]\n` : "";

  const lines = [
    `[Ref: ${variant.id}]`,
    `*${title}* — *${variantLabel}*`,
    price ? `Price: ${price}` : null,
    "",
    "Perfect — share your *phone* & *delivery address* to confirm this order (name optional).",
  ].filter(Boolean);

  return `${imageLine}${lines.join("\n")}`;
}
