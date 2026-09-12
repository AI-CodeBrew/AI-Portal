import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveStoreCurrency } from "@/lib/currency";
import type {
  ShopifyCatalogProductDetail,
  ShopifyCatalogProductListItem,
} from "@/lib/shopify";

export type ShopifyCacheRow = {
  id: number;
  store_id: string;
  title: string;
  handle: string | null;
  status: string | null;
  vendor: string | null;
  product_type: string | null;
  description: string | null;
  image_url: string | null;
  price_from: string | null;
  currency: string | null;
  total_inventory: number | null;
  variant_count: number;
  shopify_updated_at: string | null;
  synced_at: string;
  detail: ShopifyCatalogProductDetail | null;
};

export function cacheRowToListItem(
  row: ShopifyCacheRow
): ShopifyCatalogProductListItem {
  return {
    id: Number(row.id),
    title: row.title,
    handle: row.handle,
    status: row.status,
    vendor: row.vendor,
    productType: row.product_type,
    description: row.description,
    imageUrl: row.image_url,
    priceFrom: row.price_from,
    currency: row.currency,
    totalInventory: row.total_inventory,
    variantCount: row.variant_count ?? 1,
  };
}

export function cacheRowToDetail(
  row: ShopifyCacheRow
): ShopifyCatalogProductDetail {
  if (row.detail && Array.isArray(row.detail.variants)) {
    return {
      ...row.detail,
      id: Number(row.detail.id ?? row.id),
      title: row.detail.title || row.title,
    };
  }

  return {
    id: Number(row.id),
    title: row.title,
    handle: row.handle,
    status: row.status,
    vendor: row.vendor,
    productType: row.product_type,
    tags: [],
    description: row.description,
    descriptionHtml: null,
    images: row.image_url ? [{ url: row.image_url, alt: row.title }] : [],
    variants: [
      {
        id: Number(row.id),
        title: "Default",
        sku: null,
        price: row.price_from ?? "0",
        compareAtPrice: null,
        inventoryQuantity: row.total_inventory ?? 0,
        inStock: (row.total_inventory ?? 0) > 0,
        barcode: null,
      },
    ],
    createdAt: null,
    updatedAt: row.shopify_updated_at,
  };
}

export async function getShopifyCatalogSyncState(storeId: string): Promise<{
  connected: boolean;
  count: number;
  lastSyncedAt: string | null;
  syncing: boolean;
}> {
  const supabase = createAdminClient();
  const [{ count }, store] = await Promise.all([
    supabase
      .from("shopify_products_cache")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId),
    (async () => {
      const full = await supabase
        .from("stores")
        .select(
          "shop_domain, shopify_access_token, shopify_products_synced_at, shopify_products_sync_started_at"
        )
        .eq("id", storeId)
        .maybeSingle();
      if (!full.error) return full.data as Record<string, unknown> | null;
      const fallback = await supabase
        .from("stores")
        .select("shop_domain, shopify_access_token")
        .eq("id", storeId)
        .maybeSingle();
      return fallback.data as Record<string, unknown> | null;
    })(),
  ]);

  const connected = Boolean(store?.shop_domain && store.shopify_access_token);
  const startedRaw = store?.shopify_products_sync_started_at;
  const startedAt =
    typeof startedRaw === "string" ? new Date(startedRaw).getTime() : 0;
  const syncing = Boolean(startedAt && Date.now() - startedAt < 90_000);

  return {
    connected,
    count: count ?? 0,
    lastSyncedAt:
      typeof store?.shopify_products_synced_at === "string"
        ? store.shopify_products_synced_at
        : null,
    syncing,
  };
}

export async function listCachedShopifyProducts(
  storeId: string,
  options: { query?: string; page?: number; limit?: number } = {}
): Promise<{
  products: ShopifyCatalogProductListItem[];
  totalCount: number;
  currency: string;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const offset = (page - 1) * limit;
  const q = options.query?.trim() ?? "";

  const supabase = createAdminClient();
  let query = supabase
    .from("shopify_products_cache")
    .select("*", { count: "exact" })
    .eq("store_id", storeId)
    .order("title", { ascending: true })
    .range(offset, offset + limit - 1);

  if (q) {
    const safe = q.replace(/[%_,()]/g, "").slice(0, 80);
    query = query.or(
      `title.ilike.%${safe}%,handle.ilike.%${safe}%,vendor.ilike.%${safe}%,product_type.ilike.%${safe}%`
    );
  }

  const [{ data: rows, count, error }, currency] = await Promise.all([
    query,
    getEffectiveStoreCurrency(storeId),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  const products = ((rows ?? []) as ShopifyCacheRow[]).map((row) => ({
    ...cacheRowToListItem(row),
    currency: row.currency ?? currency,
  }));

  const totalCount = count ?? 0;
  return {
    products,
    totalCount,
    currency,
    page,
    pageSize: limit,
    hasNextPage: offset + limit < totalCount,
    hasPreviousPage: page > 1,
  };
}

export async function getCachedShopifyProduct(
  storeId: string,
  productId: number
): Promise<{
  product: ShopifyCatalogProductDetail;
  currency: string;
} | null> {
  const supabase = createAdminClient();
  const [{ data: row }, currency] = await Promise.all([
    supabase
      .from("shopify_products_cache")
      .select("*")
      .eq("store_id", storeId)
      .eq("id", productId)
      .maybeSingle(),
    getEffectiveStoreCurrency(storeId),
  ]);

  if (!row) return null;
  return {
    product: cacheRowToDetail(row as ShopifyCacheRow),
    currency: (row.currency as string | null) ?? currency,
  };
}

export async function searchCachedShopifyProducts(
  storeId: string,
  query: string,
  limit = 10
): Promise<
  Array<{
    id: number;
    title: string;
    description: string | null;
    imageUrl: string | null;
    currency: string | null;
    priceFrom: string | null;
    variants: ShopifyCatalogProductDetail["variants"];
  }>
> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const safe = trimmed.replace(/[%_,()]/g, "").slice(0, 80);
  const supabase = createAdminClient();
  const [{ data: rows }, currency] = await Promise.all([
    supabase
      .from("shopify_products_cache")
      .select("*")
      .eq("store_id", storeId)
      .or(
        `title.ilike.%${safe}%,handle.ilike.%${safe}%,vendor.ilike.%${safe}%,product_type.ilike.%${safe}%`
      )
      .order("title", { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 30)),
    getEffectiveStoreCurrency(storeId),
  ]);

  return ((rows ?? []) as ShopifyCacheRow[]).map((row) => {
    const detail = cacheRowToDetail(row);
    return {
      id: detail.id,
      title: detail.title,
      description: detail.description,
      imageUrl: detail.images[0]?.url ?? row.image_url,
      currency: row.currency ?? currency,
      priceFrom: row.price_from,
      variants: detail.variants,
    };
  });
}

export async function sampleCachedShopifyProducts(
  storeId: string,
  limit = 8
): Promise<ShopifyCacheRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("shopify_products_cache")
    .select("*")
    .eq("store_id", storeId)
    .order("title", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 40));
  return (data ?? []) as ShopifyCacheRow[];
}

export async function findCachedShopifyVariant(
  storeId: string,
  variantId: string
): Promise<{
  productId: number;
  title: string;
  price: string;
  inventoryQuantity: number;
  inStock: boolean;
  productTitle: string;
  imageUrl: string | null;
} | null> {
  const numeric = Number(variantId);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from("shopify_products_cache")
    .select("id, title, image_url, detail")
    .eq("store_id", storeId)
    .contains("detail", { variants: [{ id: numeric }] })
    .limit(1);

  const row = rows?.[0] as
    | {
        id: number;
        title: string;
        image_url: string | null;
        detail: ShopifyCatalogProductDetail | null;
      }
    | undefined;
  const variant = row?.detail?.variants?.find((v) => Number(v.id) === numeric);
  if (!row || !variant) return null;

  return {
    productId: Number(row.id),
    title: variant.title,
    price: variant.price,
    inventoryQuantity: variant.inventoryQuantity,
    inStock: variant.inStock,
    productTitle: row.title,
    imageUrl: row.detail?.images?.[0]?.url ?? row.image_url,
  };
}
