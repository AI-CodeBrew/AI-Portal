import { AiSettingsPanel } from "@/components/AiSettingsPanel";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function AiSettingsPage() {
  return (
    <div>
      <DashboardPageHeader
        title="AI Settings"
        description="Customize your WhatsApp AI agent name, opening message, reply style, and prompt templates."
      />
      <AiSettingsPanel />
    </div>
  );
}
