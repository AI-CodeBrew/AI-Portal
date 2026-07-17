import { DashboardPageHeader } from "@/components/DashboardPageHeader";
import { ResellerBillingPanel } from "@/components/ResellerBillingPanel";

export default function ResellerPlanPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Plan & AI Usage"
        description="Compare plans, product limits, and Shopify access. Upgrade via PayTabs or ask your admin for Enterprise."
      />
      <ResellerBillingPanel />
    </div>
  );
}
