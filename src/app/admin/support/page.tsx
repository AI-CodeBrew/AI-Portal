import { getAdminResellers } from "@/lib/admin/resellers";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminSupportChatPanel } from "@/components/AdminSupportChatPanel";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  const { resellers, error } = await getAdminResellers();

  return (
    <div>
      <AdminPageHeader
        title="Support chat"
        description="Reply to reseller support threads. Unread threads show a violet dot."
      />

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load resellers: {error}
        </div>
      )}

      <AdminSupportChatPanel resellers={resellers} />
    </div>
  );
}
