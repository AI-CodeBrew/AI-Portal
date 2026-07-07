import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getResellers() {
  const supabase = createAdminClient();

  const { data: resellers } = await supabase
    .from("portal_users")
    .select(
      `
      id, email, full_name, created_at, store_id,
      stores (
        id, store_name, shop_domain, shopify_api_key, whatsapp_phone_number_id, whatsapp_waba_id, created_at
      )
    `
    )
    .eq("role", "reseller")
    .order("created_at", { ascending: false });

  if (!resellers) return [];

  const enriched = await Promise.all(
    resellers.map(async (r) => {
      const storeId = r.store_id;
      const [{ count: orderCount }, { count: chatCount }] = await Promise.all([
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("store_id", storeId ?? ""),
        supabase
          .from("whatsapp_conversations")
          .select("*", { count: "exact", head: true })
          .eq("store_id", storeId ?? ""),
      ]);

      const store = Array.isArray(r.stores) ? r.stores[0] : r.stores;

      return {
        ...r,
        store,
        orderCount: orderCount ?? 0,
        chatCount: chatCount ?? 0,
      };
    })
  );

  return enriched;
}

export default async function AdminResellersPage() {
  const resellers = await getResellers();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Resellers</h1>
        <p className="mt-1 text-sm text-slate-600">
          All registered resellers and their connectivity status
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Reseller
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Shopify
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                WhatsApp
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Orders
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Chats
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Joined
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {resellers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-600">
                  No resellers yet
                </td>
              </tr>
            ) : (
              resellers.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {r.full_name || r.email}
                    </p>
                    <p className="text-xs text-slate-600">{r.email}</p>
                    {r.store?.store_name && (
                      <p className="text-xs text-slate-500">{r.store.store_name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.store?.shop_domain ? (
                      <span className="font-medium text-emerald-700">
                        {r.store.shop_domain}
                      </span>
                    ) : (
                      <span className="text-slate-400">Not connected</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.store?.whatsapp_phone_number_id ? (
                      <span className="font-medium text-emerald-700">Connected</span>
                    ) : (
                      <span className="text-slate-400">Not connected</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    {r.orderCount}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    {r.chatCount}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
