import { DashboardPageHeader } from "@/components/DashboardPageHeader";
import { ResellerBillingPanel } from "@/components/ResellerBillingPanel";

export default function ResellerPlanPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Plan & AI Usage"
        description="Each AI WhatsApp reply counts as one usage. Upgrade with PayTabs checkout when you need more."
      />
      <ResellerBillingPanel />
    </div>
  );
}
