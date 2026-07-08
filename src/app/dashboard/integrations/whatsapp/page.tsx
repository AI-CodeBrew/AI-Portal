import { Suspense } from "react";
import { IntegrationsNav } from "@/components/IntegrationsNav";
import { WhatsAppIntegrationPanel } from "@/components/WhatsAppIntegrationPanel";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function WhatsAppIntegrationPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Integrations"
        description="Connect WhatsApp Business for AI chat and order confirmations."
      >
        <IntegrationsNav />
      </DashboardPageHeader>
      <Suspense fallback={<p className="text-slate-600">Loading...</p>}>
        <WhatsAppIntegrationPanel />
      </Suspense>
    </div>
  );
}
