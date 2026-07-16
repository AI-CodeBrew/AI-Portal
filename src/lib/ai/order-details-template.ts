/** Clear copy-paste template so customers send details the AI can parse. */
export function orderDetailsTemplate(opts?: {
  includeVariantHint?: boolean;
  defaultQty?: number;
}): string {
  const qty = opts?.defaultQty && opts.defaultQty > 1 ? String(opts.defaultQty) : "1";
  const variantLine = opts?.includeVariantHint ? "\nVariant: size/color" : "";

  return `Phone: (required — e.g. 03XXXXXXXXX or 923XXXXXXXXX)
Address: (required — house/street + area/city)
Name: (optional)
Qty: ${qty}${variantLine}`;
}
