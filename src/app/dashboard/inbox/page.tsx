import { InboxWorkspace } from "@/components/InboxWorkspace";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function ResellerInboxPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Inbox"
        description="WhatsApp chats and template broadcasts. Search customers by name or phone, and switch chats to manual when you want to reply yourself."
      />
      <InboxWorkspace />
    </div>
  );
}
