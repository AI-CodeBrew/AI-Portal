import { SupabaseClient } from "@supabase/supabase-js";
import {
  listShopifyCatalogProducts,
  type ShopifyCatalogProductListItem,
} from "@/lib/shopify";

export interface ShopifyProductRow {
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
  synced_at: string;
}

function toRow(
  storeId: string,
  p: ShopifyCatalogProductListItem
): ShopifyProductRow {
  return {
    id: p.id,
    store_id: storeId,
    title: p.title,
    handle: p.handle,
    status: p.status,
    vendor: p.vendor,
    product_type: p.productType,
    description: p.description,
    image_url: p.imageUrl,
    price_from: p.priceFrom,
    currency: p.currency,
    total_inventory: p.totalInventory,
    variant_count: p.variantCount,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Full sync: paginate through all Shopify products and upsert into cache table.
 * Returns the count of products synced.
 */
export async function syncAllShopifyProducts(
  supabase: SupabaseClient,
  storeId: string,
  shopDomain: string,
  encryptedToken: string
): Promise<{ count: number; error?: string }> {
  const allRows: ShopifyProductRow[] = [];
  let cursor: string | null = null;
  let hasNext = true;

  while (hasNext) {
    const page = await listShopifyCatalogProducts(shopDomain, encryptedToken, {
      limit: 50,
      cursor: cursor ?? undefined,
      direction: "next",
    });

    for (const p of page.products) {
      allRows.push(toRow(storeId, p));
    }

    hasNext = page.hasNextPage;
    cursor = page.nextCursor;
  }

  if (allRows.length === 0) {
    return { count: 0 };
  }

  // Upsert in batches of 200
  const BATCH = 200;
  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("shopify_products_cache")
      .upsert(batch, { onConflict: "store_id,id" });
    if (error) {
      console.error("[sync-products] upsert error:", error);
      return { count: allRows.length, error: error.message };
    }
  }

  // Remove products that no longer exist in Shopify
  const syncedIds = allRows.map((r) => r.id);
  await supabase
    .from("shopify_products_cache")
    .delete()
    .eq("store_id", storeId)
    .not("id", "in", `(${syncedIds.join(",")})`);

  return { count: allRows.length };
}

/**
 * Upsert a single product from a Shopify webhook payload.
 */
export async function upsertShopifyProductFromWebhook(
  supabase: SupabaseClient,
  storeId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const row: ShopifyProductRow = {
    id: payload.id as number,
    store_id: storeId,
    title: (payload.title as string) || "",
    handle: (payload.handle as string) || null,
    status: (payload.status as string) || null,
    vendor: (payload.vendor as string) || null,
    product_type: (payload.product_type as string) || null,
    description: (payload.body_html as string) || null,
    image_url: (payload.image as { src?: string })?.src ||
      ((payload.images as Array<{ src?: string }>)?.[0]?.src ?? null),
    price_from: extractPriceFrom(payload),
    currency: null,
    total_inventory: null,
    variant_count: Array.isArray(payload.variants)
      ? (payload.variants as unknown[]).length
      : 1,
    synced_at: new Date().toISOString(),
  };

  await supabase
    .from("shopify_products_cache")
    .upsert(row, { onConflict: "store_id,id" });
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

function extractPriceFrom(payload: Record<string, unknown>): string | null {
  const variants = payload.variants as Array<{ price?: string }> | undefined;
  if (!variants?.length) return null;
  const prices = variants
    .map((v) => parseFloat(v.price || "0"))
    .filter((n) => !isNaN(n));
  if (!prices.length) return null;
  return String(Math.min(...prices));
}
