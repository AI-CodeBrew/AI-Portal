import { Suspense } from "react";
import { getAdminResellers } from "@/lib/admin/resellers";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminOrdersView } from "@/components/AdminOrdersView";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const { resellers, error } = await getAdminResellers();

  return (
    <div>
      <AdminPageHeader
        title="All Orders"
        description="Browse orders by reseller with pagination. View only — resellers confirm orders from their dashboard."
      />

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load resellers: {error}
        </div>
      )}

      <Suspense
        fallback={
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
            Loading orders...
          </div>
        }
      >
        <AdminOrdersView resellers={resellers} />
      </Suspense>
    </div>
  );
}
