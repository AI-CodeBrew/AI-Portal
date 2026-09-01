import { Suspense } from "react";
import { getAdminResellers } from "@/lib/admin/resellers";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminRebuttalsPanel } from "@/components/AdminRebuttalsPanel";

export const dynamic = "force-dynamic";

export default async function AdminRebuttalsPage() {
  const { resellers, error } = await getAdminResellers();

  return (
    <div>
      <AdminPageHeader
        title="Rebuttals"
        description="Review objections the AI hit for the first time and approve the answers it is allowed to use."
      />

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load resellers: {error}
        </div>
      )}

      <Suspense
        fallback={
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
            Loading rebuttals...
          </div>
        }
      >
        <AdminRebuttalsPanel resellers={resellers} />
      </Suspense>
    </div>
  );
}
