/** Shopify/default variant titles that are not real customer-facing options. */
export function isPlaceholderVariantTitle(
  title: string | null | undefined
): boolean {
  if (!title?.trim()) return true;
  const t = title.trim().toLowerCase();
  return (
    t === "default" ||
    t === "default title" ||
    t === "default variant" ||
    t.startsWith("default ")
  );
}

export function isRealVariantTitle(title: string | null | undefined): boolean {
  return Boolean(title?.trim()) && !isPlaceholderVariantTitle(title);
}

export type VariantCatalogProduct = {
  options?: Array<{ name?: string; values?: string[] }>;
  variants?: Array<{ title?: string | null }>;
};

/** True when the customer must pick a color/size/variant before ordering. */
export function productHasSelectableVariants(
  product: VariantCatalogProduct
): boolean {
  const multiValueOption = (product.options ?? []).some(
    (o) => (o.values?.length ?? 0) > 1
  );
  if (multiValueOption) return true;

  const meaningful = (product.variants ?? []).filter((v) =>
    isRealVariantTitle(v.title ?? null)
  );
  return meaningful.length > 1;
}

export function meaningfulVariantCount(product: VariantCatalogProduct): number {
  return (product.variants ?? []).filter((v) =>
    isRealVariantTitle(v.title ?? null)
  ).length;
}
