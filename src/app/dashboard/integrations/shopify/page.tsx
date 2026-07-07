import { Suspense } from "react";
import { IntegrationsNav } from "@/components/IntegrationsNav";
import { ShopifyIntegrationPanel } from "@/components/ShopifyIntegrationPanel";

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.SHOPIFY_APP_URL ||
    "http://localhost:3000"
  );
}

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
