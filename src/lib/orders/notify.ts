import {
  getStoreWhatsAppCredentials,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  formatOrderConfirmationParams,
  toWhatsAppRecipient,
} from "@/lib/whatsapp";
import { getApprovedWhatsAppOrderTemplate } from "@/lib/whatsapp/message-templates";
import { formatMoney } from "@/lib/currency";
import type { Store } from "@/lib/types";

export type WhatsAppNotifyResult =
  | { sent: true; method: "template" | "text"; to: string }
  | { sent: false; reason: string; to?: string };

async function sendOneConfirmation(params: {
  store: Store;
  to: string;
  customerName?: string | null;
  orderNumber: string;
  items: Array<{ title: string; quantity: number }>;
  total: number;
  currency?: string | null;
}): Promise<WhatsAppNotifyResult> {
  const waCreds = getStoreWhatsAppCredentials(params.store);
  if (!waCreds) {
    return { sent: false, reason: "WhatsApp not connected for this store", to: params.to };
  }

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
      to: params.to,
      templateName,
      languageCode,
      bodyParams,
    });
    console.log(
      `[notify] order confirmation template sent to=${params.to} template=${templateName}`
    );
    return { sent: true, method: "template", to: params.to };
  } catch (templateErr) {
    console.warn(
      `[notify] template failed to=${params.to}, falling back to text:`,
      templateErr
    );

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
        to: params.to,
        text,
      });
      console.log(`[notify] order confirmation text sent to=${params.to}`);
      return { sent: true, method: "text", to: params.to };
    } catch (textErr) {
      const message =
        textErr instanceof Error ? textErr.message : "WhatsApp send failed";
      console.error(`[notify] confirmation failed to=${params.to}: ${message}`);
      return { sent: false, reason: message, to: params.to };
    }
  }
}

export async function notifyCustomerOrderConfirmed(params: {
  store: Store;
  customerPhone: string | null | undefined;
  /** Open WhatsApp chat number — used as country hint + delivery fallback */
  conversationPhone?: string | null;
  customerName?: string | null;
  orderNumber: string;
  items: Array<{ title: string; quantity: number }>;
  total: number;
  currency?: string | null;
}): Promise<WhatsAppNotifyResult> {
  const hint = params.conversationPhone ?? null;
  const primary = params.customerPhone?.trim()
    ? toWhatsAppRecipient(params.customerPhone, hint)
    : "";
  const conversation = hint ? toWhatsAppRecipient(hint) : "";

  if (!primary && !conversation) {
    return { sent: false, reason: "No customer phone on file" };
  }

  const targets = Array.from(
    new Set([primary, conversation].filter((p) => p.length >= 10))
  );

  let lastFail: WhatsAppNotifyResult = {
    sent: false,
    reason: "No valid WhatsApp recipient",
  };

  for (const to of targets) {
    const result = await sendOneConfirmation({
      store: params.store,
      to,
      customerName: params.customerName,
      orderNumber: params.orderNumber,
      items: params.items,
      total: params.total,
      currency: params.currency,
    });
    if (result.sent) return result;
    lastFail = result;
  }

  return lastFail;
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

We're preparing your order for dispatch. Typical delivery is 2–5 business days (cash on delivery where available). We'll share tracking once it's on the way.

Thank you for your order!`;
}
