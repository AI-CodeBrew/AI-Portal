import { AdLinksPanel } from "@/components/AdLinksPanel";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function AdsPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Ad Links"
        description="Create WhatsApp links for Meta ads so the AI knows which product each customer is asking about."
      />
      <AdLinksPanel />
    </div>
  );
}
