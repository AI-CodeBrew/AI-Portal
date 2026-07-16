import { OutcomesPanel } from "@/components/OutcomesPanel";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function OutcomesPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Deal outcomes"
        description="Review what worked in closed WhatsApp deals and promote the best conversations into the live AI agent."
      />
      <OutcomesPanel />
    </div>
  );
}
