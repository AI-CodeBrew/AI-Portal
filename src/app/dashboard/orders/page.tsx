import { Suspense } from "react";
import { OrdersList } from "@/components/OrdersList";

export default function ResellerOrdersPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
        <p className="mt-1 text-sm text-slate-600">
          Filter by status, confirm pending orders, and keep Shopify in sync.
        </p>
      </div>
      <Suspense fallback={<p className="text-slate-600">Loading orders...</p>}>
        <OrdersList />
      </Suspense>
    </div>
  );
}
