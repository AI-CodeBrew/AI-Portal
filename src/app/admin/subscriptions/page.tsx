import { getAdminResellers } from "@/lib/admin/resellers";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminSubscriptionsPanel } from "@/components/AdminSubscriptionsPanel";

export const dynamic = "force-dynamic";

export default async function AdminSubscriptionsPage() {
  const { resellers, error } = await getAdminResellers();

  return (
    <div>
      <AdminPageHeader
        title="Subscriptions"
        description="See which plan each reseller is on and filter by Basic, Pro, or Max"
      />

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load subscriptions: {error}
        </div>
      )}

      <AdminSubscriptionsPanel initialResellers={resellers} />
    </div>
  );
}
