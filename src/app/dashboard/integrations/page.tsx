import Link from "next/link";
import { IntegrationsNav } from "@/components/IntegrationsNav";
import { ConnectionBadge } from "@/components/ConnectionStatus";
import { BrandIconBox } from "@/components/BrandIcons";
import { PlanUsageCard } from "@/components/PlanUsageCard";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function getStoreForUser() {
  const user = await getAuthUser();
  if (!user?.storeId) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("stores")
    .select(
      "store_name, shop_domain, shopify_access_token, shopify_api_key, whatsapp_phone_number_id, whatsapp_access_token, paytabs_profile_id, paytabs_server_key"
    )
    .eq("id", user.storeId)
    .single();
  return data;
}

export default async function IntegrationsOverviewPage() {
  const store = await getStoreForUser();
  const shopifyConnected = Boolean(store?.shopify_access_token);
  const whatsappConnected = Boolean(
    store?.whatsapp_phone_number_id && store?.whatsapp_access_token
  );
  const paytabsConnected = Boolean(
    store?.paytabs_profile_id && store?.paytabs_server_key
  );

  const apps = [
    {
      name: "Shopify",
      brand: "shopify" as const,
      href: "/dashboard/integrations/shopify",
      connected: shopifyConnected,
      description: "Sync orders · Confirm back to Shopify",
      detail: store?.shop_domain ?? "Not configured",
    },
    {
      name: "WhatsApp",
      brand: "whatsapp" as const,
      href: "/dashboard/integrations/whatsapp",
      connected: whatsappConnected,
      description: "Confirmations · AI chat · Inbox",
      detail: store?.whatsapp_phone_number_id
        ? `Phone ID ${store.whatsapp_phone_number_id}`
        : "Not configured",
    },
    {
      name: "PayTabs",
      brand: "paytabs" as const,
      href: "/dashboard/integrations/paytabs",
      connected: paytabsConnected,
      description: "Buy AI plans · Card payments",
      detail: paytabsConnected
        ? `Profile ${store?.paytabs_profile_id}`
        : "Not configured",
    },
  ];

  return (
    <div>
      <DashboardPageHeader
        title="Integrations"
        description="Connect Shopify, WhatsApp, and PayTabs."
      >
        <IntegrationsNav />
      </DashboardPageHeader>
      <div className="mb-6">
        <PlanUsageCard compact />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => (
          <Link
            key={app.href}
            href={app.href}
            className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start gap-4">
              <BrandIconBox brand={app.brand} size="md" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900">{app.name}</h3>
                  <ConnectionBadge
                    connected={app.connected}
                    label={app.connected ? "On" : "Off"}
                  />
                </div>
                <p className="mt-1 text-sm text-slate-600">{app.description}</p>
                <p className="mt-2 text-xs text-slate-500">{app.detail}</p>
                <span className="mt-3 inline-block text-sm font-medium text-blue-600 group-hover:underline">
                  Configure →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
