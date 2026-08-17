import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStoreWhatsAppCredentials,
  normalizePhone,
  sendWhatsAppText,
} from "@/lib/whatsapp";
import { formatMoney } from "@/lib/currency";
import { maybeAutoConfirmShopifyOrder } from "@/lib/orders/confirm";

function formatItems(
  items: Array<{ title?: string; quantity?: number }> | null | undefined
): string {
  if (!items?.length) return "your items";
  return items
    .map((i) => `${i.quantity ?? 1}x ${i.title ?? "item"}`)
    .join(", ");
}

/**
 * After a new Shopify order lands:
 * - If auto_confirm is on → confirm immediately (existing path).
 * - Else → open/ensure WhatsApp conversation and ask customer to confirm or cancel via AI.
 */
export async function maybeStartShopifyConfirmationOutreach(
  storeId: string,
  orderId: string
): Promise<void> {
  const supabase = createAdminClient();

  const { data: store } = await supabase
    .from("stores")
    .select(
      "id, store_name, shop_domain, auto_confirm_orders, auto_follow_up_template_id, whatsapp_phone_number_id, whatsapp_access_token"
    )
    .eq("id", storeId)
    .maybeSingle();

  if (!store) return;

  if (store.auto_confirm_orders) {
    await maybeAutoConfirmShopifyOrder(storeId, orderId);
    return;
  }

  const { data: order } = await supabase
    .from("orders")
    .select("*, customers(phone, name)")
    .eq("id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!order || order.status !== "pending") return;

  const customer = order.customers as {
    phone: string | null;
    name: string | null;
  } | null;

  const phoneRaw =
    customer?.phone ||
    (order.shipping_address as { phone?: string } | null)?.phone ||
    null;

  if (!phoneRaw) {
    console.warn(
      `[shopify-confirm-outreach] order=${orderId} skipped: no customer phone`
    );
    return;
  }

  const waCreds = getStoreWhatsAppCredentials(store);
  if (!waCreds) {
    console.warn(
      `[shopify-confirm-outreach] order=${orderId} skipped: WhatsApp not connected`
    );
    return;
  }

  const customerPhone = normalizePhone(phoneRaw);
  const orderNumber = (order.order_number as string) || orderId.slice(0, 8);
  const total = Number(order.total ?? 0);
  const currency = (order.currency as string | null) ?? null;
  const totalLabel = currency ? formatMoney(total, currency) : total.toFixed(2);
  const itemsLabel = formatItems(
    order.items as Array<{ title?: string; quantity?: number }>
  );
  const name =
    customer?.name ||
    (order.shipping_address as { name?: string } | null)?.name ||
    null;
  const greeting = name ? `Hi ${name}` : "Hi";
  const storeLabel =
    (store.store_name as string | null) ||
    (store.shop_domain as string | null) ||
    "our store";

  const outreachText = `${greeting}! Thanks for ordering from ${storeLabel}.

Your order *${orderNumber}* (${itemsLabel}) — total *${totalLabel}* — is pending confirmation.

Please reply *CONFIRM* to place it for dispatch, or *CANCEL* if you want to cancel.

We're here on WhatsApp if you have any questions.`;

  let { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .select("id, status")
    .eq("store_id", storeId)
    .eq("customer_phone", customerPhone)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conversation) {
    const { data: created } = await supabase
      .from("whatsapp_conversations")
      .insert({
        store_id: storeId,
        customer_phone: customerPhone,
        status: "ai_handling",
      })
      .select("id, status")
      .single();
    conversation = created;
  } else if (conversation.status === "human_handoff") {
    // Leave human chats alone; still send the ask so customer sees it
  } else {
    await supabase
      .from("whatsapp_conversations")
      .update({
        status: "ai_handling",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
  }

  if (!conversation) return;

  let metaMessageId: string | null = null;
  try {
    const result = await sendWhatsAppText({
      phoneNumberId: waCreds.phoneNumberId,
      accessToken: waCreds.accessToken,
      to: customerPhone,
      text: outreachText,
    });
    metaMessageId = result.id;
  } catch (err) {
    console.error(
      `[shopify-confirm-outreach] send failed order=${orderId}:`,
      err
    );
    return;
  }

  await supabase.from("whatsapp_messages").insert({
    conversation_id: conversation.id,
    direction: "out",
    content: outreachText,
    meta_message_id: metaMessageId,
    status: metaMessageId ? "sent" : null,
  });

  await supabase
    .from("whatsapp_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);
}
