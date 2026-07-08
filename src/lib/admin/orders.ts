import { createAdminClient } from "@/lib/supabase/admin";

export type AdminOrderRow = {
  id: string;
  order_number: string | null;
  total: number | null;
  currency: string | null;
  status: string;
  source: string;
  store_id: string;
  created_at: string;
  customers: { phone: string; name: string | null } | null;
  stores: {
    shop_domain: string | null;
    owner_email: string | null;
    store_name: string | null;
  } | null;
};

export async function getAdminOrders(storeId?: string): Promise<AdminOrderRow[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      total,
      currency,
      status,
      source,
      store_id,
      created_at,
      customers (phone, name),
      stores (shop_domain, owner_email, store_name)
    `
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[admin/orders]", error.message);
    return [];
  }

  return (data ?? []).map((order) => ({
    ...order,
    customers: Array.isArray(order.customers)
      ? (order.customers[0] ?? null)
      : order.customers,
    stores: Array.isArray(order.stores)
      ? (order.stores[0] ?? null)
      : order.stores,
  })) as AdminOrderRow[];
}
