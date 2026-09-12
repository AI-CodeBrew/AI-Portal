import { formatMoney } from "@/lib/currency";
import {
  getPrimaryProductImageUrl,
  sampleActiveCatalogProducts,
  searchPortalProducts,
} from "@/lib/products/products-service";
import {
  cacheRowToDetail,
  getCachedShopifyProduct,
  sampleCachedShopifyProducts,
  searchCachedShopifyProducts,
} from "@/lib/shopify/cached-catalog";
import { getEffectiveStoreCurrency } from "@/lib/currency";
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

  const currency = await getEffectiveStoreCurrency(store.id);

  const portalHits = trimmed
    ? await searchPortalProducts(store.id, trimmed)
    : await sampleActiveCatalogProducts(store.id, limit);

  const portalMapped = portalHits.map(mapPortalHit);

  if (!shopifyConnected) {
    return portalMapped.slice(0, limit);
  }

  let shopifyMapped: InboxCatalogProduct[] = [];

  if (trimmed) {
    const shopifyHits = await searchCachedShopifyProducts(
      store.id,
      trimmed,
      limit
    );
    shopifyMapped = shopifyHits.map((p) => ({
      key: `shopify:${p.id}`,
      source: "shopify" as const,
      id: String(p.id),
      title: p.title,
      sku: p.variants[0]?.sku ?? null,
      price: p.variants[0]?.price ?? p.priceFrom ?? "0",
      currency: p.currency ?? currency,
      imageUrl: p.imageUrl,
      variants: p.variants.map((v) => ({
        id: String(v.id),
        title: v.title,
        sku: v.sku,
        price: v.price,
        priceFormatted: formatPrice(v.price, p.currency ?? currency),
      })),
    }));
  } else {
    const rows = await sampleCachedShopifyProducts(store.id, Math.max(limit, 8));
    shopifyMapped = rows.map((row) => {
      const detail = cacheRowToDetail(row);
      const productCurrency = row.currency ?? currency;
      return {
        key: `shopify:${row.id}`,
        source: "shopify" as const,
        id: String(row.id),
        title: row.title,
        sku: detail.variants[0]?.sku ?? null,
        price: row.price_from ?? "0",
        currency: productCurrency,
        imageUrl: row.image_url,
        variants: detail.variants.map((v) => ({
          id: String(v.id),
          title: v.title,
          sku: v.sku,
          price: v.price,
          priceFormatted: formatPrice(v.price, productCurrency),
        })),
      };
    });
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
  const numericId = Number(productId);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;

  const cached = await getCachedShopifyProduct(store.id, numericId);
  if (!cached) return null;

  const currency = cached.currency;
  const variants = cached.product.variants.map((v) => ({
    id: String(v.id),
    title: v.title,
    sku: v.sku,
    price: v.price,
    priceFormatted: formatPrice(v.price, currency),
  }));

  const chosen =
    (variantId && variants.find((v) => v.id === variantId)) || variants[0];

  return {
    key: `shopify:${cached.product.id}`,
    source: "shopify",
    id: String(cached.product.id),
    title: cached.product.title,
    sku: chosen?.sku ?? null,
    price: chosen?.price ?? "0",
    currency,
    imageUrl: cached.product.images[0]?.url ?? null,
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
