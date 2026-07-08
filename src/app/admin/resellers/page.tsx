import { getAdminResellers } from "@/lib/admin/resellers";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminResellersPanel } from "@/components/AdminResellersPanel";

export const dynamic = "force-dynamic";

export default async function AdminResellersPage() {
  const { resellers, error } = await getAdminResellers();

  return (
    <div>
      <AdminPageHeader
        title="Resellers"
        description="Manage plans, monitor AI usage, and inspect reseller accounts"
      />

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load resellers: {error}. Ensure{" "}
          <strong>SUPABASE_SERVICE_ROLE_KEY</strong> is set.
        </div>
      )}

      {resellers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <p className="text-base font-medium text-slate-800">No resellers yet</p>
          <p className="mt-2 text-sm text-slate-600">
            Resellers appear here after they sign up at <strong>/signup</strong>.
          </p>
        </div>
      ) : (
        <AdminResellersPanel initialResellers={resellers} />
      )}
    </div>
  );
}
