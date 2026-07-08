import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminDashboard } from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export default function AdminOverviewPage() {
  return (
    <div>
      <AdminPageHeader
        title="Overview"
        description="Platform-wide stats across all resellers"
      />
      <AdminDashboard />
    </div>
  );
}
