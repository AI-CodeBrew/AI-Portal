import { Suspense } from "react";
import { IntegrationsNav } from "@/components/IntegrationsNav";
import { ShopifyIntegrationPanel } from "@/components/ShopifyIntegrationPanel";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";
import { getAppUrl } from "@/lib/app-url";

export default function ShopifyIntegrationPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Integrations"
        description="Connect your Shopify store to sync products and orders."
      >
        <IntegrationsNav />
      </DashboardPageHeader>
      <Suspense fallback={<p className="text-slate-600">Loading...</p>}>
        <ShopifyIntegrationPanel appUrl={getAppUrl()} />
      </Suspense>
    </div>
  );
}
