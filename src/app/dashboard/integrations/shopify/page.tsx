import { Suspense } from "react";
import { IntegrationsNav } from "@/components/IntegrationsNav";
import { ShopifyIntegrationPanel } from "@/components/ShopifyIntegrationPanel";
import { getAppUrl } from "@/lib/app-url";

export default function ShopifyIntegrationPage() {
  return (
    <div>
      <IntegrationsNav />
      <Suspense fallback={<p className="text-slate-600">Loading...</p>}>
        <ShopifyIntegrationPanel appUrl={getAppUrl()} />
      </Suspense>
    </div>
  );
}
