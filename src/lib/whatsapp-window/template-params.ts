import { formatMoney } from "@/lib/currency";
import type { TemplateProductContext } from "@/lib/inbox/template-product-context";

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
  product?: TemplateProductContext | null;
};

export type TemplateRowForSend = {
  body_text: string;
  header_format?: string | null;
  button_type?: string | null;
  button_url_pattern?: string | null;
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

/** Fill {{1}}, {{2}}, … from conversation / order / product context. */
export function buildTemplateBodyParams(
  bodyText: string,
  context: TemplateContext
): string[] {
  const varCount = countBodyVariables(bodyText);
  if (varCount === 0) return [];

  const product = context.product;
  const items = context.items ?? [];
  const orderNumber = context.orderNumber ?? "your order";
  const total = context.total ?? 0;
  const orderDefaults = formatOrderSummaryParams(
    orderNumber,
    items,
    total,
    context.currency
  );

  const productTitle = product?.title ?? orderDefaults[1] ?? "our product";
  const productPrice = product?.priceFormatted ?? orderDefaults[2] ?? String(total);
  const productLine = product
    ? `${product.title}${product.priceFormatted ? ` — ${product.priceFormatted}` : ""}`
    : orderDefaults[1] ?? orderDefaults[0];

  const pool = [
    context.customerName?.trim() || "there",
    product ? productTitle : productLine,
    product ? productPrice : orderDefaults[2] ?? String(total),
    product?.sku?.trim() || context.sku?.trim() || orderDefaults[0],
    orderDefaults[0],
    context.currency ?? "PKR",
    product?.productUrl ?? "",
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

export function resolveTemplateRichSendOptions(
  template: TemplateRowForSend,
  context: TemplateContext
): {
  headerImageUrl: string | null;
  buttonUrlPath: string | null;
} {
  const product = context.product;
  const headerImageUrl =
    template.header_format === "IMAGE" ? product?.imageUrl ?? null : null;

  let buttonUrlPath: string | null = null;
  if (template.button_type === "URL" && product?.urlPath) {
    buttonUrlPath = product.urlPath;
  }

  return { headerImageUrl, buttonUrlPath };
}
