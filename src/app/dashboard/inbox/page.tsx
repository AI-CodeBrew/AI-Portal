import { InboxWorkspace } from "@/components/InboxWorkspace";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function ResellerInboxPage() {
  return (
    <div>
      <DashboardPageHeader
        compact
        title="Inbox"
        description="Search by name or phone. Take over a chat to reply yourself."
      />
      <InboxWorkspace />
    </div>
  );
}
