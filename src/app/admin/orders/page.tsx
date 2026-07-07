import { createAdminClient } from "@/lib/supabase/admin";
import { AdminOrdersList } from "@/components/AdminOrdersList";

export const dynamic = "force-dynamic";

async function getAllOrders() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      total,
      currency,
      status,
      source,
      customers (phone, name),
      stores (shop_domain, owner_email)
    `
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return data ?? [];
}

export default async function AdminOrdersPage() {
  const raw = await getAllOrders();

  const orders = raw.map((order) => ({
    ...order,
    customers: Array.isArray(order.customers)
      ? order.customers[0] ?? null
      : order.customers,
    stores: Array.isArray(order.stores)
      ? order.stores[0] ?? null
      : order.stores,
  }));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">All Orders</h1>
        <p className="mt-1 text-sm text-slate-600">
          Confirm orders — customer gets a WhatsApp message when WhatsApp is
          connected for that store.
        </p>
      </div>

      <AdminOrdersList orders={orders} />
    </div>
  );
}
