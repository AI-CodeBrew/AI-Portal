import {
  CATALOG_BROWSE_INTRO,
  CATALOG_BROWSE_MORE_INTRO,
  catalogBrowseActiveInHistory,
  extractProductSearchQuery,
  looksLikeCatalogBrowseMoreRequest,
  looksLikeCatalogBrowseRequest,
  looksLikeObjectionPhrase,
  productSearchTokens,
  skuMatchKey,
} from "@/lib/products/products-service";

export function extractCatalogBrowseShownProducts(
  history: Array<{ role: "user" | "assistant"; content: string }>
): { skus: string[]; titles: string[] } {
  const skus = new Set<string>();
  const titles = new Set<string>();

  for (const msg of history) {
    if (msg.role !== "assistant") continue;
    if (
      !CATALOG_BROWSE_INTRO.test(msg.content) &&
      !CATALOG_BROWSE_MORE_INTRO.test(msg.content)
    ) {
      continue;
    }

    for (const m of msg.content.matchAll(
      /(?:^|\n)([^\n]+?)\s*(?:—|-)\s*(?:Rs\.?|PKR|AED|\$|€)/gim
    )) {
      const title = m[1]
        ?.replace(/\*([^*]+)\*/g, "$1")
        .replace(/^\[Ref:[^\]]+\]\s*/i, "")
        .replace(/^\[Image:[^\]]+\]\s*/i, "")
        .trim();
      if (title && title.length >= 2 && title.length <= 120) {
        titles.add(title);
      }
    }

    for (const m of msg.content.matchAll(/\bSKU:\s*([^\n]+)/gi)) {
      const sku = m[1]?.trim();
      if (sku) skus.add(sku);
    }
  }

  return { skus: [...skus], titles: [...titles] };
}

function messageMatchesShownCatalogTitle(
  message: string,
  titles: string[]
): boolean {
  const msgKey = skuMatchKey(message);
  for (const title of titles) {
    const titleKey = skuMatchKey(title);
    if (
      msgKey.length >= 3 &&
      (titleKey.includes(msgKey) || msgKey.includes(titleKey))
    ) {
      return true;
    }

    const msgTokens = productSearchTokens(message);
    const titleTokens = productSearchTokens(title);
    const hits = msgTokens.filter((mt) =>
      titleTokens.some((tt) => {
        const a = skuMatchKey(mt);
        const b = skuMatchKey(tt);
        return a.length >= 3 && (b.includes(a) || a.includes(b));
      })
    );
    if (hits.length >= 1 && hits.length >= Math.ceil(msgTokens.length * 0.5)) {
      return true;
    }
  }
  return false;
}

/** Best-matching title from a recent catalog browse reply. */
export function pickBestShownCatalogTitle(
  message: string,
  titles: string[]
): string | null {
  let best: string | null = null;
  let bestScore = 0;
  const msgTokens = productSearchTokens(message);

  for (const title of titles) {
    let score = 0;
    const titleKey = skuMatchKey(title);
    const msgKey = skuMatchKey(message);
    if (msgKey.length >= 3 && titleKey.includes(msgKey)) score += 10;
    for (const mt of msgTokens) {
      const a = skuMatchKey(mt);
      if (a.length < 3) continue;
      if (titleKey.includes(a)) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      best = title;
    }
  }

  return bestScore >= 3 ? best : null;
}

/** User is picking one of the products shown in a catalog browse reply. */
export function looksLikeCatalogProductPick(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): boolean {
  if (!catalogBrowseActiveInHistory(history)) return false;

  const t = message.trim();
  if (t.length < 2) return false;
  if (looksLikeCatalogBrowseRequest(t)) return false;
  if (looksLikeCatalogBrowseMoreRequest(t, history)) return false;
  if (looksLikeObjectionPhrase(t)) return false;

  const { titles } = extractCatalogBrowseShownProducts(history);
  if (!titles.length) return false;

  if (messageMatchesShownCatalogTitle(t, titles)) return true;

  // "i want Audionic ENC" — not bare color/size answers like "yellow"
  const hasPickIntent =
    /\b(i\s+)?(?:want|need|order|buy|get|take|interested in|go with|choose|pick|i(?:'ll| will) take)\b/i.test(
      t
    );
  if (!hasPickIntent) return false;

  const query = extractProductSearchQuery(t);
  return Boolean(query && query.length >= 3);
}
