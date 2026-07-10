import {
  getStoreWhatsAppCredentials,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  formatOrderConfirmationParams,
  normalizePhone,
} from "@/lib/whatsapp";
import { getApprovedWhatsAppOrderTemplate } from "@/lib/whatsapp/message-templates";
import { formatMoney } from "@/lib/currency";
import type { Store } from "@/lib/types";

export type WhatsAppNotifyResult =
  | { sent: true; method: "template" | "text" }
  | { sent: false; reason: string };

export async function notifyCustomerOrderConfirmed(params: {
  store: Store;
  customerPhone: string | null | undefined;
  customerName?: string | null;
  orderNumber: string;
  items: Array<{ title: string; quantity: number }>;
  total: number;
  currency?: string | null;
}): Promise<WhatsAppNotifyResult> {
  const phone = params.customerPhone?.trim();
  if (!phone) {
    return { sent: false, reason: "No customer phone on file" };
  }

  const waCreds = getStoreWhatsAppCredentials(params.store);
  if (!waCreds) {
    return { sent: false, reason: "WhatsApp not connected for this store" };
  }

  const to = normalizePhone(phone);
  const bodyParams = formatOrderConfirmationParams(
    params.orderNumber,
    params.items,
    params.total,
    params.currency
  );

  const selected = await getApprovedWhatsAppOrderTemplate(params.store.id);
  const templateName = selected?.name || "order_confirmed";
  const languageCode = selected?.language || "en";

  try {
    await sendWhatsAppTemplate({
      phoneNumberId: waCreds.phoneNumberId,
      accessToken: waCreds.accessToken,
      to,
      templateName,
      languageCode,
      bodyParams,
    });
    return { sent: true, method: "template" };
  } catch (templateErr) {
    console.warn("WhatsApp template failed, falling back to text:", templateErr);

    try {
      const text = formatOrderConfirmationMessage(
        params.orderNumber,
        params.items,
        params.total,
        params.currency,
        params.customerName
      );
      await sendWhatsAppText({
        phoneNumberId: waCreds.phoneNumberId,
        accessToken: waCreds.accessToken,
        to,
        text,
      });
      return { sent: true, method: "text" };
    } catch (textErr) {
      const message =
        textErr instanceof Error ? textErr.message : "WhatsApp send failed";
      return { sent: false, reason: message };
    }
  }
}

export function formatOrderConfirmationMessage(
  orderNumber: string,
  items: Array<{ title: string; quantity: number }>,
  total: number,
  currency?: string | null,
  customerName?: string | null
): string {
  const totalLabel = currency
    ? formatMoney(total, currency)
    : total.toFixed(2);
  const itemsSummary = items.map((i) => `${i.quantity}x ${i.title}`).join(", ");
  const greeting = customerName ? `Hi ${customerName}, ` : "Hi, ";

  return `${greeting}your order *${orderNumber}* has been confirmed! ✅

*Items:* ${itemsSummary}
*Total:* ${totalLabel}

Thank you for your order. We'll process it shortly.`;
}
