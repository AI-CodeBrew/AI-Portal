import { createAdminClient } from "@/lib/supabase/admin";

export type AdminTopProduct = {
  title: string;
  unitsSold: number;
  revenue: number;
  orderCount: number;
  currency: string | null;
  resellerCount: number;
  topReseller: string | null;
};

/**
 * Aggregate line items across all reseller orders (pending + confirmed).
 */
export async function getAdminTopProducts(
  limit = 50
): Promise<AdminTopProduct[]> {
  const supabase = createAdminClient();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("items, total, currency, store_id, status, stores(store_name, shop_domain)")
    .in("status", ["confirmed", "pending"])
    .order("created_at", { ascending: false })
    .limit(8000);

  if (error) {
    throw new Error(error.message);
  }

  type Agg = {
    title: string;
    unitsSold: number;
    revenue: number;
    orderCount: number;
    currency: string | null;
    stores: Map<string, string>;
  };

  const byTitle = new Map<string, Agg>();

  for (const order of orders ?? []) {
    const store = order.stores as
      | { store_name?: string | null; shop_domain?: string | null }
      | { store_name?: string | null; shop_domain?: string | null }[]
      | null;
    const storeObj = Array.isArray(store) ? store[0] : store;
    const resellerLabel =
      storeObj?.store_name?.trim() ||
      storeObj?.shop_domain?.replace(/\.myshopify\.com$/i, "") ||
      "Reseller";
    const storeId = String(order.store_id ?? "");
    const currency = (order.currency as string | null) ?? null;
    const items = Array.isArray(order.items) ? order.items : [];

    const seenTitlesInOrder = new Set<string>();

    for (const raw of items) {
      const item = raw as {
        title?: string;
        name?: string;
        quantity?: number;
        price?: number;
      };
      const title = (item.title || item.name || "Untitled").trim();
      if (!title) continue;
      // Key by title + currency — the same product name sold in two
      // currencies must not have its revenue summed into one number.
      const key = `${title.toLowerCase()}::${currency ?? ""}`;
      const qty = Math.max(1, Number(item.quantity) || 1);
      const price = Number(item.price) || 0;
      const lineRevenue = price * qty;

      let agg = byTitle.get(key);
      if (!agg) {
        agg = {
          title,
          unitsSold: 0,
          revenue: 0,
          orderCount: 0,
          currency,
          stores: new Map(),
        };
        byTitle.set(key, agg);
      }
      agg.unitsSold += qty;
      agg.revenue += lineRevenue;
      if (storeId) agg.stores.set(storeId, resellerLabel);
      if (!seenTitlesInOrder.has(key)) {
        agg.orderCount += 1;
        seenTitlesInOrder.add(key);
      }
    }
  }

  const ranked = Array.from(byTitle.values())
    .map((a) => {
      let topReseller: string | null = null;
      // Prefer reseller with most appearance — we only track presence; use first label
      const labels = Array.from(a.stores.values());
      topReseller = labels[0] ?? null;
      return {
        title: a.title,
        unitsSold: a.unitsSold,
        revenue: Math.round(a.revenue * 100) / 100,
        orderCount: a.orderCount,
        currency: a.currency,
        resellerCount: a.stores.size,
        topReseller,
      };
    })
    .sort((a, b) => b.unitsSold - a.unitsSold || b.revenue - a.revenue)
    .slice(0, limit);

  return ranked;
}
