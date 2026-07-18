import { formatMoney } from "@/lib/currency";
import {
  getPrimaryProductImageUrl,
  sampleActiveCatalogProducts,
  searchPortalProducts,
} from "@/lib/products/products-service";
import {
  getShopCurrency,
  getShopifyCatalogProduct,
  listShopifyCatalogProducts,
  searchProducts,
} from "@/lib/shopify";
import type { Store } from "@/lib/types";

export type InboxCatalogProduct = {
  key: string;
  source: "portal" | "shopify";
  id: string;
  title: string;
  sku: string | null;
  price: string;
  currency: string;
  imageUrl: string | null;
  variants: Array<{
    id: string;
    title: string;
    sku: string | null;
    price: string;
    priceFormatted: string;
  }>;
};

function formatPrice(price: string, currency: string): string {
  const n = parseFloat(price);
  return Number.isFinite(n) ? formatMoney(n, currency) : price;
}

function mapPortalHit(
  hit: Awaited<ReturnType<typeof searchPortalProducts>>[number]
): InboxCatalogProduct {
  const variants =
    hit.variants.length > 0
      ? hit.variants.map((v) => ({
          id: v.id,
          title: v.title,
          sku: v.sku,
          price: v.price,
          priceFormatted: formatPrice(v.price, hit.currency),
        }))
      : [
          {
            id: hit.id,
            title: "Default",
            sku: hit.sku,
            price: hit.price,
            priceFormatted: formatPrice(hit.price, hit.currency),
          },
        ];

  return {
    key: `portal:${hit.id}`,
    source: "portal",
    id: hit.id,
    title: hit.title,
    sku: hit.sku,
    price: hit.price,
    currency: hit.currency,
    imageUrl: hit.imageUrl,
    variants,
  };
}

export async function searchInboxCatalogProducts(
  store: Store,
  query: string,
  limit = 8
): Promise<InboxCatalogProduct[]> {
  const trimmed = query.trim();
  const shopifyConnected = Boolean(
    store.shop_domain && store.shopify_access_token
  );

  let currency = "PKR";
  if (shopifyConnected) {
    try {
      currency =
        (await getShopCurrency(store.shop_domain!, store.shopify_access_token!)) ??
        "USD";
    } catch {
      currency = "USD";
    }
  }

  const portalHits = trimmed
    ? await searchPortalProducts(store.id, trimmed)
    : await sampleActiveCatalogProducts(store.id, limit);

  const portalMapped = portalHits.map(mapPortalHit);

  if (!shopifyConnected) {
    return portalMapped.slice(0, limit);
  }

  let shopifyMapped: InboxCatalogProduct[] = [];

  if (trimmed) {
    const shopifyHits = await searchProducts(
      store.shop_domain!,
      store.shopify_access_token!,
      trimmed
    );
    shopifyMapped = shopifyHits.map((p) => ({
      key: `shopify:${p.id}`,
      source: "shopify" as const,
      id: String(p.id),
      title: p.title,
      sku: null,
      price: p.variants[0]?.price ?? "0",
      currency,
      imageUrl: p.imageUrl,
      variants: p.variants.map((v) => ({
        id: String(v.id),
        title: v.title,
        sku: null,
        price: v.price,
        priceFormatted: formatPrice(v.price, currency),
      })),
    }));
  } else {
    const { products } = await listShopifyCatalogProducts(
      store.shop_domain!,
      store.shopify_access_token!,
      { limit: Math.max(limit, 8) }
    );

    shopifyMapped = products.map((p) => ({
      key: `shopify:${p.id}`,
      source: "shopify" as const,
      id: String(p.id),
      title: p.title,
      sku: null,
      price: p.priceFrom ?? "0",
      currency: p.currency ?? currency,
      imageUrl: p.imageUrl,
      variants: [],
    }));
  }

  const merged = [...portalMapped, ...shopifyMapped];
  const seen = new Set<string>();
  const deduped: InboxCatalogProduct[] = [];

  for (const item of merged) {
    const dedupeKey = `${item.source}:${item.title.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    deduped.push(item);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

export async function loadShopifyProductForInboxSend(
  store: Store,
  productId: string,
  variantId?: string
): Promise<InboxCatalogProduct | null> {
  if (!store.shop_domain || !store.shopify_access_token) return null;

  const numericId = Number(productId);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;

  const full = await getShopifyCatalogProduct(
    store.shop_domain,
    store.shopify_access_token,
    numericId
  );
  if (!full) return null;

  let currency = "USD";
  try {
    currency =
      (await getShopCurrency(store.shop_domain, store.shopify_access_token)) ??
      "USD";
  } catch {
    /* keep default */
  }

  const variants = full.variants.map((v) => ({
    id: String(v.id),
    title: v.title,
    sku: v.sku,
    price: v.price,
    priceFormatted: formatPrice(v.price, currency),
  }));

  const chosen =
    (variantId && variants.find((v) => v.id === variantId)) || variants[0];

  return {
    key: `shopify:${full.id}`,
    source: "shopify",
    id: String(full.id),
    title: full.title,
    sku: chosen?.sku ?? null,
    price: chosen?.price ?? "0",
    currency,
    imageUrl: full.images[0]?.url ?? null,
    variants,
  };
}

export function inboxCatalogProductToSearchProduct(
  product: InboxCatalogProduct
) {
  return {
    title: product.title,
    sku: product.sku ?? undefined,
    imageUrl: product.imageUrl,
    variants: product.variants.map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      price_formatted: v.priceFormatted,
    })),
  };
}
