import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminAiDefaultsPanel } from "@/components/AdminAiDefaultsPanel";

export const dynamic = "force-dynamic";

export default function AdminAiDefaultsPage() {
  return (
    <div>
      <AdminPageHeader
        title="AI Defaults"
        description="Platform defaults used when a reseller has not configured their own AI settings"
      />
      <AdminAiDefaultsPanel />
    </div>
  );
}
