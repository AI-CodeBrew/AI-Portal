import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getStats() {
  const supabase = createAdminClient();

  const [
    { count: resellerCount },
    { count: orderCount },
    { count: chatCount },
    { count: shopifyConnected },
    { count: whatsappConnected },
  ] = await Promise.all([
    supabase
      .from("portal_users")
      .select("*", { count: "exact", head: true })
      .eq("role", "reseller"),
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("stores")
      .select("*", { count: "exact", head: true })
      .not("shop_domain", "is", null),
    supabase
      .from("stores")
      .select("*", { count: "exact", head: true })
      .not("whatsapp_phone_number_id", "is", null),
  ]);

  return {
    resellerCount: resellerCount ?? 0,
    orderCount: orderCount ?? 0,
    chatCount: chatCount ?? 0,
    shopifyConnected: shopifyConnected ?? 0,
    whatsappConnected: whatsappConnected ?? 0,
  };
}

export default async function AdminOverviewPage() {
  const stats = await getStats();

  const cards = [
    { label: "Total Resellers", value: stats.resellerCount, color: "blue" },
    { label: "Total Orders", value: stats.orderCount, color: "emerald" },
    { label: "Total Chats", value: stats.chatCount, color: "violet" },
    { label: "Shopify Connected", value: stats.shopifyConnected, color: "amber" },
    { label: "WhatsApp Connected", value: stats.whatsappConnected, color: "green" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Admin Overview</h1>
        <p className="mt-1 text-sm text-slate-600">
          Platform-wide stats across all resellers
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-600">{card.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
