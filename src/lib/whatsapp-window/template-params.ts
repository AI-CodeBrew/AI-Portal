import { formatMoney, DEFAULT_STORE_CURRENCY } from "@/lib/currency";

function formatOrderSummaryParams(
  orderNumber: string,
  items: Array<{ title: string; quantity: number }>,
  total: number,
  currency?: string | null
): string[] {
  const itemsSummary = items
    .map((i) => `${i.quantity}x ${i.title}`)
    .join(", ");
  const totalLabel = currency
    ? formatMoney(total, currency)
    : total.toFixed(2);
  return [orderNumber, itemsSummary, totalLabel];
}

export type TemplateContext = {
  customerName?: string | null;
  orderNumber?: string | null;
  items?: Array<{ title: string; quantity: number }>;
  total?: number | null;
  currency?: string | null;
  sku?: string | null;
};

function countBodyVariables(bodyText: string): number {
  const matches = bodyText.match(/\{\{(\d+)\}\}/g) ?? [];
  let max = 0;
  for (const m of matches) {
    const n = Number(m.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return max;
}

type SlotKind =
  | "name"
  | "order"
  | "items"
  | "total"
  | "currency"
  | "sku"
  | "unknown";

/**
 * What a placeholder means, read from the words right before it.
 * Templates do not put their variables in a fixed order — "Your order #{{1}}"
 * and "Hi {{1}}" both exist — so position alone cannot decide.
 */
function classifySlot(before: string): SlotKind {
  const tail = before
    .replace(/\{\{\d+\}\}/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trimEnd();

  if (/(total|amount|payable|grand total|price)\s*[:\-–]?\s*$/.test(tail)) {
    return "total";
  }
  if (/(items?|products?|order summary|you ordered)\s*[:\-–]?\s*$/.test(tail)) {
    return "items";
  }
  if (
    /(order|invoice|receipt|tracking)\s*(no\.?|number|id)?\s*[:#\-–]?\s*$/.test(
      tail
    )
  ) {
    return "order";
  }
  if (/(sku|item code|product code)\s*[:\-–]?\s*$/.test(tail)) return "sku";
  if (/currency\s*[:\-–]?\s*$/.test(tail)) return "currency";
  if (/\b(hi|hello|hey|dear|assalam|assalamu|salam|aoa)\b[\s,!]*$/.test(tail)) {
    return "name";
  }
  if (/\bname\s*[:\-–]?\s*$/.test(tail)) return "name";
  return "unknown";
}

type Slot = {
  kind: SlotKind;
  /** Template already prints a "#" right before this variable. */
  hashPrefixed: boolean;
};

function inferSlots(bodyText: string, varCount: number): Slot[] {
  const contextByVar = new Map<number, string>();
  const re = /\{\{(\d+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyText)) !== null) {
    const n = Number(m[1]);
    if (!contextByVar.has(n)) {
      contextByVar.set(n, bodyText.slice(Math.max(0, m.index - 60), m.index));
    }
  }

  const slots: Slot[] = [];
  for (let i = 1; i <= varCount; i++) {
    const before = contextByVar.get(i) ?? "";
    slots.push({
      kind: classifySlot(before),
      hashPrefixed: before.trimEnd().endsWith("#"),
    });
  }
  return slots;
}

/** Fill {{1}}, {{2}}, … from conversation / order context. */
export function buildTemplateBodyParams(
  bodyText: string,
  context: TemplateContext
): string[] {
  const varCount = countBodyVariables(bodyText);
  if (varCount === 0) return [];

  const items = context.items ?? [];
  const orderNumber = context.orderNumber?.trim() || "";
  const total = context.total ?? 0;
  const defaults = formatOrderSummaryParams(
    orderNumber || "your order",
    items,
    total,
    context.currency
  );
  const itemsSummary = defaults[1]?.trim() || "";
  const totalLabel = defaults[2]?.trim() || String(total);

  // Positional fallback, kept for templates whose wording gives no clue.
  const pool = [
    context.customerName?.trim() || "there",
    context.sku?.trim() || itemsSummary || orderNumber,
    totalLabel,
    orderNumber,
    context.currency ?? DEFAULT_STORE_CURRENCY,
  ];

  const byKind: Record<SlotKind, string> = {
    name: context.customerName?.trim() || "there",
    // Never label a missing order number as if it were one.
    order: orderNumber || "your order",
    items: itemsSummary || context.sku?.trim() || "your order",
    total: totalLabel,
    currency: context.currency ?? DEFAULT_STORE_CURRENCY,
    sku: context.sku?.trim() || itemsSummary || "",
    unknown: "",
  };

  const slots = inferSlots(bodyText, varCount);

  const params: string[] = [];
  for (let i = 0; i < varCount; i++) {
    const slot = slots[i] ?? { kind: "unknown" as SlotKind, hashPrefixed: false };
    const resolved =
      slot.kind === "unknown" ? "" : byKind[slot.kind].trim();
    let value = resolved || (pool[i] ?? pool[pool.length - 1] ?? "").trim();
    // order_number is stored with its own "#" — don't double it up
    if (slot.hashPrefixed) value = value.replace(/^#/, "");
    // Meta rejects empty params, and newlines are not allowed inside one.
    params.push((value || "N/A").replace(/\s*\n+\s*/g, " ").slice(0, 900));
  }
  return params;
}

export function previewTemplateBody(
  bodyText: string,
  context: TemplateContext
): string {
  const params = buildTemplateBodyParams(bodyText, context);
  let preview = bodyText;
  params.forEach((value, index) => {
    preview = preview.replace(
      new RegExp(`\\{\\{${index + 1}\\}\\}`, "g"),
      value
    );
  });
  return preview;
}
