import { InboxWorkspace } from "@/components/InboxWorkspace";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function ResellerInboxPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Inbox"
        description="WhatsApp chats and broadcasts. Search by name or phone, take over chats when you need to reply yourself."
      />
      <InboxWorkspace />
    </div>
  );
}
