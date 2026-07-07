import { Suspense } from "react";
import { IntegrationsNav } from "@/components/IntegrationsNav";
import { WhatsAppIntegrationPanel } from "@/components/WhatsAppIntegrationPanel";

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.SHOPIFY_APP_URL ||
    "http://localhost:3000"
  );
}

export default function WhatsAppIntegrationPage() {
  return (
    <div>
      <IntegrationsNav />
      <Suspense fallback={<p className="text-slate-600">Loading...</p>}>
        <WhatsAppIntegrationPanel appUrl={getAppUrl()} />
      </Suspense>
    </div>
  );
}
