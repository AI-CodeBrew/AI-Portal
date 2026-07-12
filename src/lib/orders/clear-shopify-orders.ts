import type { SupabaseClient } from "@supabase/supabase-js";

/** Remove synced Shopify orders for a portal store (previous shop leftover). */
export async function clearStoreShopifyOrders(
  supabase: SupabaseClient,
  storeId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("orders")
    .delete()
    .eq("store_id", storeId)
    .eq("source", "shopify");

  return { error: error?.message ?? null };
}
