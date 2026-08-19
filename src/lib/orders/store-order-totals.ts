import { createAdminClient } from "@/lib/supabase/admin";

export type StoreOrderTotals = {
  /** Rows currently in the portal DB */
  synced: number;
  /** Shopify store total when connected; otherwise null */
  shopify: number | null;
  /** Best display total: synced DB count (orders are synced via webhook) */
  total: number;
};

/**
 * Get order totals from the local DB. Since orders are synced via webhook,
 * the local DB is the source of truth — no need to call Shopify's API.
 */
export async function getStoreOrderTotals(
  storeId: string,
  _shopDomain?: string | null,
  _shopifyAccessToken?: string | null
): Promise<StoreOrderTotals> {
  const supabase = createAdminClient();

  const [{ count: synced }, { count: shopifyOrders }] = await Promise.all([
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .not("shopify_order_id", "is", null),
  ]);

  const syncedCount = synced ?? 0;
  const shopifyCount = shopifyOrders ?? 0;

  return {
    synced: syncedCount,
    shopify: shopifyCount > 0 ? shopifyCount : null,
    total: syncedCount,
  };
}

export async function getBulkStoreOrderTotals(
  stores: Array<{
    id: string;
    shop_domain: string | null;
    shopify_access_token: string | null;
  }>
): Promise<Map<string, StoreOrderTotals>> {
  const results = await Promise.all(
    stores.map(async (store) => {
      const totals = await getStoreOrderTotals(
        store.id,
        store.shop_domain,
        store.shopify_access_token
      );
      return [store.id, totals] as const;
    })
  );
  return new Map(results);
}
