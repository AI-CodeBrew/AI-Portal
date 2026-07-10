import { IntegrationsNav } from "@/components/IntegrationsNav";
import { PayTabsIntegrationPanel } from "@/components/PayTabsIntegrationPanel";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function PayTabsIntegrationPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Integrations"
        description="Connect PayTabs to purchase AI reply plans."
      >
        <IntegrationsNav />
      </DashboardPageHeader>
      <PayTabsIntegrationPanel />
    </div>
  );
}
