import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminAiDefaultsPanel } from "@/components/AdminAiDefaultsPanel";
import { AdminLlmProviderPanel } from "@/components/AdminLlmProviderPanel";

export const dynamic = "force-dynamic";

export default function AdminAiDefaultsPage() {
  return (
    <div className="space-y-8">
      <div>
        <AdminPageHeader
          title="AI Defaults"
          description="Default AI persona and branding for new resellers"
        />
        <AdminAiDefaultsPanel />
      </div>
      <div>
        <AdminPageHeader
          title="LLM Provider"
          description="Google Gemini for WhatsApp sales AI and intent routing"
        />
        <AdminLlmProviderPanel />
      </div>
    </div>
  );
}
