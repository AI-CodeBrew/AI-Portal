import { createAdminClient } from "@/lib/supabase/admin";
import { getShopifyOrderCount } from "@/lib/shopify";

export type StoreOrderTotals = {
  /** Rows currently in the portal DB */
  synced: number;
  /** Shopify store total when connected; otherwise null */
  shopify: number | null;
  /** Best display total: Shopify + WhatsApp-only local orders */
  total: number;
};

/**
 * Local DB only keeps pages that have been synced, so counts look low.
 * Prefer Shopify's /orders/count when the store is connected, and add
 * portal-only (WhatsApp) orders that have no shopify_order_id.
 */
export async function getStoreOrderTotals(
  storeId: string,
  shopDomain?: string | null,
  shopifyAccessToken?: string | null
): Promise<StoreOrderTotals> {
  const supabase = createAdminClient();

  const [{ count: synced }, { count: whatsappOnly }] = await Promise.all([
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .is("shopify_order_id", null),
  ]);

  const syncedCount = synced ?? 0;
  const whatsappOnlyCount = whatsappOnly ?? 0;

  if (!shopDomain || !shopifyAccessToken) {
    return {
      synced: syncedCount,
      shopify: null,
      total: syncedCount,
    };
  }

  try {
    const shopify = await getShopifyOrderCount(shopDomain, shopifyAccessToken);
    return {
      synced: syncedCount,
      shopify,
      total: shopify + whatsappOnlyCount,
    };
  } catch (err) {
    console.error(
      "[store-order-totals]",
      storeId,
      err instanceof Error ? err.message : err
    );
    return {
      synced: syncedCount,
      shopify: null,
      total: syncedCount,
    };
  }
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
