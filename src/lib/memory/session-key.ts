import { normalizePhone } from "@/lib/phone";

/** Stable session id: one customer = one persistent memory namespace per store. */
export function buildSalesSessionKey(
  storeId: string,
  customerPhone: string
): string {
  const phone = normalizePhone(customerPhone);
  return `${storeId}:${phone}`;
}

export function isMemoryEnabled(): boolean {
  const flag = process.env.MEM0_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag !== "true" && flag !== "1" && flag !== "on") return false;
  // Need a vector backend + embeddings key — soft-fails inside mem0-client otherwise
  return Boolean(
    process.env.DATABASE_URL?.trim() ||
      (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  );
}
