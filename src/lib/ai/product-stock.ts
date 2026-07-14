import type { SearchProduct } from "./product-reply";
import { productSearchTokens } from "@/lib/products/products-service";

/** Internal marker — stripped before WhatsApp send via stripInternalAiMarkers. */
export function buildOosOfferMarker(
  product: SearchProduct,
  similar: SearchProduct | null
): string {
  const sku = (product.sku ?? "").replace(/\|/g, "");
  const title = (product.title ?? "Product").replace(/\|/g, "").slice(0, 120);
  const altSku = (similar?.sku ?? "").replace(/\|/g, "");
  const altTitle = (similar?.title ?? "").replace(/\|/g, "").slice(0, 120);
  return `[OOS: ${sku}|${title}|${altSku}|${altTitle}]`;
}

export function parseOosOfferMarker(content: string): {
  sku: string;
  title: string;
  altSku: string;
  altTitle: string;
} | null {
  const m = content.match(/\[OOS:\s*([^|\]]*)\|([^|\]]*)\|([^|\]]*)\|([^\]]*)\]/i);
  if (!m) return null;
  return {
    sku: m[1]?.trim() ?? "",
    title: m[2]?.trim() ?? "",
    altSku: m[3]?.trim() ?? "",
    altTitle: m[4]?.trim() ?? "",
  };
}

export function lastOosOfferFromHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): ReturnType<typeof parseOosOfferMarker> {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role !== "assistant") continue;
    const parsed = parseOosOfferMarker(history[i]!.content);
    if (parsed) return parsed;
  }
  return null;
}

export function isProductOutOfStock(p: SearchProduct): boolean {
  const variants = p.variants ?? [];
  const real = variants.filter((v) => v.title && v.title !== "Default");
  if (real.length > 0) {
    return real.every((v) => v.in_stock === false);
  }
  if (variants.length > 0) {
    return variants.every((v) => v.in_stock === false);
  }
  return false;
}

export function isProductInStock(p: SearchProduct): boolean {
  const variants = p.variants ?? [];
  if (!variants.length) return true;
  return variants.some((v) => v.in_stock !== false);
}

function productKey(p: SearchProduct): string {
  return `${p.sku ?? ""}|${p.title ?? ""}`.toLowerCase();
}

export function findSimilarInStockProduct(
  requested: SearchProduct,
  candidates: SearchProduct[]
): SearchProduct | null {
  const reqKey = productKey(requested);
  const titleTokens = productSearchTokens(requested.title ?? "");

  let best: { product: SearchProduct; score: number } | null = null;

  for (const p of candidates) {
    if (productKey(p) === reqKey) continue;
    if (!isProductInStock(p)) continue;

    const title = (p.title ?? "").toLowerCase();
    let score = 0;
    for (const t of titleTokens) {
      if (title.includes(t.toLowerCase())) score += 1;
    }
    if (score <= 0) score = 1; // any other in-stock hit from same search

    if (!best || score > best.score) {
      best = { product: p, score };
    }
  }

  return best?.product ?? null;
}

export function pickRequestedProduct(
  products: SearchProduct[],
  query: string,
  sku: string | null
): SearchProduct {
  if (sku) {
    const normalized = sku.toUpperCase();
    const hit = products.find(
      (p) => (p.sku ?? "").toUpperCase() === normalized
    );
    if (hit) return hit;
  }
  const q = query.toLowerCase();
  const byTitle = products.find((p) =>
    (p.title ?? "").toLowerCase().includes(q)
  );
  if (byTitle) return byTitle;
  return products[0]!;
}

const PREF_SIMILAR =
  /\b(similar|alternative|alt|show me|see it|that one|first|option\s*1|yes|yeah|yep|okay|ok|haan|han|ji|the other|dikhao|dikha|wala|similar wala)\b/i;

const PREF_NOTIFY =
  /\b(notify|notification|alert|back in stock|when available|when it's back|when its back|let me know|remind|wait|second|option\s*2|later|stock alert|available ho|aaye ga|aajaye)\b/i;

export function parseStockPreference(text: string): "similar" | "notify" | null {
  const t = text.trim();
  if (t.length < 1) return null;
  if (PREF_NOTIFY.test(t)) return "notify";
  if (PREF_SIMILAR.test(t)) return "similar";
  if (/^(ok|okay|yes|yeah|yep|han|haan|ji|theek|thik)[\s!.]*$/i.test(t)) {
    return "similar";
  }
  return null;
}
