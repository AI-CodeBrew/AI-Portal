import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getAllChats() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("whatsapp_conversations")
    .select(
      `
      *,
      stores (shop_domain, owner_email)
    `
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  return data ?? [];
}

export default async function AdminChatsPage() {
  const chats = await getAllChats();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">All Chats</h1>
        <p className="mt-1 text-sm text-slate-600">
          WhatsApp conversations across all reseller stores
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Customer
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Store
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Last Updated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {chats.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-600">
                  No conversations yet
                </td>
              </tr>
            ) : (
              chats.map((chat) => {
                const store = chat.stores as {
                  shop_domain: string | null;
                  owner_email: string | null;
                } | null;

                return (
                  <tr key={chat.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                      +{chat.customer_phone}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {store?.shop_domain ?? store?.owner_email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          chat.status === "human_handoff"
                            ? "bg-amber-100 text-amber-900"
                            : chat.status === "closed"
                              ? "bg-slate-100 text-slate-700"
                              : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {chat.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {new Date(chat.updated_at).toLocaleString()}
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
