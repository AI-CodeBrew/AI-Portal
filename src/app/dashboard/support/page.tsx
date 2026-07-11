import { SupportChatPanel } from "@/components/SupportChatPanel";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function ResellerSupportPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Support"
        description="Chat with the Arabia AI team about billing, WhatsApp, or store setup."
      />
      <SupportChatPanel />
    </div>
  );
}
