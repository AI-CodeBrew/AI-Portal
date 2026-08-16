import {
  CATALOG_BROWSE_INTRO,
  CATALOG_BROWSE_MORE_INTRO,
} from "@/lib/products/products-service";

/** Products shown in a recent catalog browse reply — used to avoid repeats
 * when the customer asks for "more" / "other" options. */
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
