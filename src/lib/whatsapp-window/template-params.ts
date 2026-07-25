import { formatMoney } from "@/lib/currency";

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

/** Fill {{1}}, {{2}}, … from conversation / order context. */
export function buildTemplateBodyParams(
  bodyText: string,
  context: TemplateContext
): string[] {
  const varCount = countBodyVariables(bodyText);
  if (varCount === 0) return [];

  const items = context.items ?? [];
  const orderNumber = context.orderNumber ?? "your order";
  const total = context.total ?? 0;
  const defaults = formatOrderSummaryParams(
    orderNumber,
    items,
    total,
    context.currency
  );

  const pool = [
    context.customerName?.trim() || "there",
    context.sku?.trim() || (defaults[1] ?? defaults[0]),
    defaults[2] ?? String(total),
    defaults[0],
    context.currency ?? "AED",
  ];

  const params: string[] = [];
  for (let i = 0; i < varCount; i++) {
    params.push(pool[i] ?? pool[pool.length - 1] ?? "");
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
