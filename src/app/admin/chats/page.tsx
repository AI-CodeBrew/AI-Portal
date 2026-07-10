import { Suspense } from "react";
import { getAdminResellers } from "@/lib/admin/resellers";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminChatsView } from "@/components/AdminChatsView";

export const dynamic = "force-dynamic";

export default async function AdminChatsPage() {
  const { resellers, error } = await getAdminResellers();

  return (
    <div>
      <AdminPageHeader
        title="All Chats"
        description="Filter by reseller and status. Opening an unread chat marks it as read."
      />

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load resellers: {error}
        </div>
      )}

      <Suspense
        fallback={
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
            Loading chats...
          </div>
        }
      >
        <AdminChatsView resellers={resellers} />
      </Suspense>
    </div>
  );
}
