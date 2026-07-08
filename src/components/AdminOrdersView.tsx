"use client";

import { useSearchParams } from "next/navigation";
import { AdminOrdersPanel } from "@/components/AdminOrdersPanel";
import type { AdminResellerRow } from "@/lib/admin/resellers";
import type { AdminOrderRow } from "@/lib/admin/orders";

export function AdminOrdersView({
  resellers,
  orders,
}: {
  resellers: AdminResellerRow[];
  orders: AdminOrderRow[];
}) {
  const searchParams = useSearchParams();
  const initialStoreId = searchParams.get("store") ?? undefined;

  return (
    <AdminOrdersPanel
      resellers={resellers}
      orders={orders}
      initialStoreId={initialStoreId}
    />
  );
}
