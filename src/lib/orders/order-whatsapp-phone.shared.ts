/** Client-safe helpers — no server-only imports. */

export function previewOrderPhone(order: {
  shipping_address?: { phone?: string | null } | null;
  customers?: { phone?: string | null } | null;
}): string | null {
  const shippingPhone = order.shipping_address?.phone?.trim();
  const customerPhone = order.customers?.phone?.trim();
  return shippingPhone || customerPhone || null;
}
