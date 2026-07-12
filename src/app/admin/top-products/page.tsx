import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminTopProductsPanel } from "@/components/AdminTopProductsPanel";

export default function AdminTopProductsPage() {
  return (
    <div>
      <AdminPageHeader
        title="Top Products"
        description="Best-selling products across all resellers, ranked by units sold."
      />
      <AdminTopProductsPanel />
    </div>
  );
}
