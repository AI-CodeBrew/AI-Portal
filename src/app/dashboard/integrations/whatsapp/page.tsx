import { Suspense } from "react";
import { IntegrationsNav } from "@/components/IntegrationsNav";
import { WhatsAppIntegrationPanel } from "@/components/WhatsAppIntegrationPanel";

export default function WhatsAppIntegrationPage() {
  return (
    <div>
      <IntegrationsNav />
      <Suspense fallback={<p className="text-slate-600">Loading...</p>}>
        <WhatsAppIntegrationPanel />
      </Suspense>
    </div>
  );
}
