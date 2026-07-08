"use client";

import { useSearchParams } from "next/navigation";
import { AdminOrdersPanel } from "@/components/AdminOrdersPanel";
import type { AdminResellerRow } from "@/lib/admin/resellers";

export function AdminOrdersView({
  resellers,
}: {
  resellers: AdminResellerRow[];
}) {
  const searchParams = useSearchParams();
  const initialStoreId = searchParams.get("store") ?? undefined;

  return (
    <AdminOrdersPanel
      resellers={resellers}
      initialStoreId={initialStoreId}
    />
  );
}
