import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/currency";

export const dynamic = "force-dynamic";

async function getAllOrders() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("orders")
    .select(
      `
      *,
      customers (phone, name),
      stores (shop_domain, owner_email)
    `
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return data ?? [];
}

export default async function AdminOrdersPage() {
  const orders = await getAllOrders();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">All Orders</h1>
        <p className="mt-1 text-sm text-slate-600">
          Orders across all reseller stores
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Order
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Reseller / Store
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Customer
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Total
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Source
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-600">
                  No orders yet
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const customer = order.customers as {
                  phone: string;
                  name: string | null;
                } | null;
                const store = order.stores as {
                  shop_domain: string | null;
                  owner_email: string | null;
                } | null;

                return (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                      {order.order_number ?? order.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {store?.shop_domain ?? store?.owner_email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {customer?.name ?? customer?.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">
                      {formatMoney(
                        Number(order.total ?? 0),
                        order.currency as string | null
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                        {order.source}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          order.status === "confirmed"
                            ? "bg-emerald-100 text-emerald-800"
                            : order.status === "cancelled"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
