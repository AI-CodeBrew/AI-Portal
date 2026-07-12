/** Clear copy-paste template so customers send details the AI can parse. */
export function orderDetailsTemplate(opts?: {
  includeVariantHint?: boolean;
  defaultQty?: number;
}): string {
  const qty = opts?.defaultQty && opts.defaultQty > 1 ? String(opts.defaultQty) : "1";
  const variantLine = opts?.includeVariantHint
    ? "\nVariant: (size/color if any)"
    : "";

  return `To place your order, reply in this format:

Name: Your full name
Phone: 03XXXXXXXXX
Address: House/street, area, city
Qty: ${qty}${variantLine}`;
}
