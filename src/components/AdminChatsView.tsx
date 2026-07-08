"use client";

import { useSearchParams } from "next/navigation";
import { AdminChatsPanel } from "@/components/AdminChatsPanel";
import type { AdminResellerRow } from "@/lib/admin/resellers";

export function AdminChatsView({
  resellers,
}: {
  resellers: AdminResellerRow[];
}) {
  const searchParams = useSearchParams();
  const initialStoreId = searchParams.get("store") ?? undefined;

  return (
    <AdminChatsPanel resellers={resellers} initialStoreId={initialStoreId} />
  );
}
