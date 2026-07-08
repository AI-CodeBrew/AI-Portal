import { ResellerDashboard } from "@/components/ResellerDashboard";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function DashboardHomePage() {
  return (
    <div>
      <DashboardPageHeader
        title="Dashboard"
        description="Your store progress, orders, chats, and AI usage at a glance."
      />
      <ResellerDashboard />
    </div>
  );
}
