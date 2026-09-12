import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAllShopifyProductsRest,
  getShopCurrency,
  mapShopifyRestProduct,
  type ShopifyCatalogProductDetail,
  type ShopifyRestProductPayload,
} from "@/lib/shopify";

export interface ShopifyProductCacheRow {
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
  detail: ShopifyCatalogProductDetail;
}

const SYNC_LOCK_MS = 90_000;

function restToRow(
  storeId: string,
  payload: ShopifyRestProductPayload,
  currency: string | null
): ShopifyProductCacheRow {
  const detail = mapShopifyRestProduct(payload);
  const prices = detail.variants
    .map((v) => parseFloat(v.price || "0"))
    .filter((n) => Number.isFinite(n));
  const inventory = detail.variants.reduce(
    (sum, v) => sum + (v.inventoryQuantity ?? 0),
    0
  );

  return {
    id: detail.id,
    store_id: storeId,
    title: detail.title,
    handle: detail.handle,
    status: detail.status,
    vendor: detail.vendor,
    product_type: detail.productType,
    description: detail.description,
    image_url: detail.images[0]?.url ?? payload.image?.src ?? null,
    price_from: prices.length ? String(Math.min(...prices)) : null,
    currency,
    total_inventory: inventory,
    variant_count: detail.variants.length || 1,
    shopify_updated_at: detail.updatedAt,
    synced_at: new Date().toISOString(),
    detail,
  };
}

export async function persistShopifyShopCurrency(
  supabase: SupabaseClient,
  storeId: string,
  shopDomain: string,
  encryptedToken: string
): Promise<string | null> {
  try {
    const currency = (await getShopCurrency(shopDomain, encryptedToken))
      .trim()
      .toUpperCase();
    await supabase
      .from("stores")
      .update({ shopify_currency: currency })
      .eq("id", storeId);
    return currency;
  } catch (err) {
    console.error("[sync-products] shop currency failed:", err);
    return null;
  }
}

/**
 * Full sync: page through Shopify REST and upsert into cache.
 * Shopify is only contacted here (connect / manual sync), not on tab load.
 */
export async function syncAllShopifyProducts(
  supabase: SupabaseClient,
  storeId: string,
  shopDomain: string,
  encryptedToken: string
): Promise<{ count: number; skipped?: boolean; error?: string }> {
  const { data: store } = await supabase
    .from("stores")
    .select("shopify_products_sync_started_at")
    .eq("id", storeId)
    .maybeSingle();

  const startedAt = store?.shopify_products_sync_started_at
    ? new Date(store.shopify_products_sync_started_at as string).getTime()
    : 0;
  if (startedAt && Date.now() - startedAt < SYNC_LOCK_MS) {
    return { count: 0, skipped: true };
  }

  await supabase
    .from("stores")
    .update({ shopify_products_sync_started_at: new Date().toISOString() })
    .eq("id", storeId)
    .then(({ error }) => {
      if (error) {
        console.warn("[sync-products] sync lock column missing:", error.message);
      }
    });

  try {
    const currency = await persistShopifyShopCurrency(
      supabase,
      storeId,
      shopDomain,
      encryptedToken
    );

    const products = await fetchAllShopifyProductsRest(
      shopDomain,
      encryptedToken
    );
    const allRows = products
      .filter((p) => Number.isFinite(Number(p.id)))
      .map((p) => restToRow(storeId, p, currency));

    if (allRows.length === 0) {
      await supabase
        .from("shopify_products_cache")
        .delete()
        .eq("store_id", storeId);
      await supabase
        .from("stores")
        .update({ shopify_products_synced_at: new Date().toISOString() })
        .eq("id", storeId);
      return { count: 0 };
    }

    const BATCH = 100;
    for (let i = 0; i < allRows.length; i += BATCH) {
      const batch = allRows.slice(i, i + BATCH);
      const { error } = await supabase
        .from("shopify_products_cache")
        .upsert(batch, { onConflict: "store_id,id" });
      if (error) {
        const slim = batch.map(({ detail: _detail, ...row }) => row);
        const retry = await supabase
          .from("shopify_products_cache")
          .upsert(slim, { onConflict: "store_id,id" });
        if (retry.error) {
          console.error("[sync-products] upsert error:", retry.error);
          return { count: allRows.length, error: retry.error.message };
        }
      }
    }

    const syncedIds = allRows.map((r) => r.id);
    await supabase
      .from("shopify_products_cache")
      .delete()
      .eq("store_id", storeId)
      .not("id", "in", `(${syncedIds.join(",")})`);

    await supabase
      .from("stores")
      .update({ shopify_products_synced_at: new Date().toISOString() })
      .eq("id", storeId);

    return { count: allRows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("[sync-products]", err);
    return { count: 0, error: message };
  }
}

export async function upsertShopifyProductFromWebhook(
  supabase: SupabaseClient,
  storeId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { data: store } = await supabase
    .from("stores")
    .select("shopify_currency, currency")
    .eq("id", storeId)
    .maybeSingle();
  const currency =
    (store?.shopify_currency as string | null) ??
    (store?.currency as string | null) ??
    null;

  const row = restToRow(
    storeId,
    payload as ShopifyRestProductPayload,
    currency
  );
  const { error } = await supabase
    .from("shopify_products_cache")
    .upsert(row, { onConflict: "store_id,id" });
  if (error) {
    const { detail: _detail, ...slim } = row;
    await supabase
      .from("shopify_products_cache")
      .upsert(slim, { onConflict: "store_id,id" });
  }
}

export async function deleteShopifyProductFromWebhook(
  supabase: SupabaseClient,
  storeId: string,
  productId: number
): Promise<void> {
  await supabase
    .from("shopify_products_cache")
    .delete()
    .eq("store_id", storeId)
    .eq("id", productId);
}

export async function clearStoreShopifyProductsCache(
  supabase: SupabaseClient,
  storeId: string
): Promise<void> {
  await supabase.from("shopify_products_cache").delete().eq("store_id", storeId);
  await supabase
    .from("stores")
    .update({
      shopify_products_synced_at: null,
      shopify_products_sync_started_at: null,
      shopify_currency: null,
    })
    .eq("id", storeId);
}
