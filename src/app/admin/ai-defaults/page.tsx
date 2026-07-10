import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminAiDefaultsPanel } from "@/components/AdminAiDefaultsPanel";

export const dynamic = "force-dynamic";

export default function AdminAiDefaultsPage() {
  return (
    <div>
      <AdminPageHeader
        title="AI Defaults"
        description="Default AI persona and branding for new resellers"
      />
      <AdminAiDefaultsPanel />
    </div>
  );
}
