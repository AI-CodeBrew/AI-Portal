import { DashboardPageHeader } from "@/components/DashboardPageHeader";
import { WhatsAppTemplatesPanel } from "@/components/WhatsAppTemplatesPanel";

export default function WhatsAppTemplatesPage() {
  return (
    <div>
      <DashboardPageHeader
        title="WhatsApp Templates"
        description="Create message templates and submit them to Meta for approval."
      />
      <WhatsAppTemplatesPanel />
    </div>
  );
}
