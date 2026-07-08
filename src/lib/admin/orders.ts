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

export const ADMIN_ORDERS_PAGE_SIZE = 25;

const orderSelect = `
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
`;

function mapOrderRow(order: Record<string, unknown>): AdminOrderRow {
  return {
    ...order,
    customers: Array.isArray(order.customers)
      ? (order.customers[0] ?? null)
      : (order.customers as AdminOrderRow["customers"]),
    stores: Array.isArray(order.stores)
      ? (order.stores[0] ?? null)
      : (order.stores as AdminOrderRow["stores"]),
  } as AdminOrderRow;
}

export type AdminOrdersResult = {
  orders: AdminOrderRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function getAdminOrders(options?: {
  storeId?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminOrdersResult> {
  const supabase = createAdminClient();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(
    100,
    Math.max(1, options?.pageSize ?? ADMIN_ORDERS_PAGE_SIZE)
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("orders")
    .select(orderSelect, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (options?.storeId) {
    query = query.eq("store_id", options.storeId);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[admin/orders]", error.message);
    return { orders: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const total = count ?? 0;

  return {
    orders: (data ?? []).map((order) => mapOrderRow(order)),
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export async function getAdminRecentOrders(
  limit = 5
): Promise<AdminOrderRow[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("orders")
    .select(orderSelect)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin/orders] recent:", error.message);
    return [];
  }

  return (data ?? []).map((order) => mapOrderRow(order));
}

export async function getAdminOrdersTotal(storeId?: string): Promise<number> {
  const supabase = createAdminClient();

  let query = supabase
    .from("orders")
    .select("*", { count: "exact", head: true });

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { count, error } = await query;

  if (error) {
    console.error("[admin/orders] count:", error.message);
    return 0;
  }

  return count ?? 0;
}
