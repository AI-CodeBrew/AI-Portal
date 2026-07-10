import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminPayTabsPanel } from "@/components/AdminPayTabsPanel";

export const dynamic = "force-dynamic";

export default function AdminBillingPage() {
  return (
    <div>
      <AdminPageHeader
        title="Billing / PayTabs"
        description="Connect PayTabs once. Resellers select a plan and pay via checkout."
      />
      <AdminPayTabsPanel />
    </div>
  );
}
