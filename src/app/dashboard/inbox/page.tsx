import { InboxPanel } from "@/components/InboxPanel";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function ResellerInboxPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Inbox"
        description="All WhatsApp conversations. Switch chats to manual mode when you want to reply yourself."
      />
      <InboxPanel />
    </div>
  );
}
