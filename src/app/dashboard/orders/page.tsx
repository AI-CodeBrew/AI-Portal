import { Suspense } from "react";
import { OrdersList } from "@/components/OrdersList";
import { DashboardPageHeader } from "@/components/DashboardPageHeader";

export default function ResellerOrdersPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Orders"
        description="Filter by status, confirm pending orders, and keep Shopify in sync."
      />
      <Suspense fallback={<p className="text-slate-600">Loading orders...</p>}>
        <OrdersList />
      </Suspense>
    </div>
  );
}
