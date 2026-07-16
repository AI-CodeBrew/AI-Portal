import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchShopifyOrderContact } from "@/lib/shopify";
import { toWhatsAppRecipient } from "@/lib/phone";

type OrderRow = {
  id: string;
  store_id: string;
  customer_id: string | null;
  shopify_order_id: string | null;
  shipping_address?: unknown;
  customers?:
    | { phone: string | null; name: string | null }
    | { phone: string | null; name: string | null }[]
    | null;
};

type StoreRow = {
  shop_domain?: string | null;
  shopify_access_token?: string | null;
};

async function findConversationPhone(
  supabase: SupabaseClient,
  storeId: string,
  customerId: string | null
): Promise<string | null> {
  if (!customerId) return null;

  const { data } = await supabase
    .from("whatsapp_conversations")
    .select("customer_phone")
    .eq("store_id", storeId)
    .eq("customer_id", customerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.customer_phone as string | null)?.trim() || null;
}

export async function findOrderConversationId(
  supabase: SupabaseClient,
  storeId: string,
  customerId: string | null,
  recipientPhone: string
): Promise<string | null> {
  if (customerId) {
    const { data } = await supabase
      .from("whatsapp_conversations")
      .select("id")
      .eq("store_id", storeId)
      .eq("customer_id", customerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.id) return data.id as string;
  }

  const { data } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("store_id", storeId)
    .eq("customer_phone", recipientPhone)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.id as string | null) ?? null;
}

/**
 * Resolve the WhatsApp number for an order — same sources as order confirmation:
 * shipping phone → linked customer → WhatsApp chat → Shopify order contact.
 */
export async function resolveOrderWhatsAppRecipient(
  supabase: SupabaseClient,
  order: OrderRow,
  store: StoreRow
): Promise<
  | { to: string; customerName: string | null; rawPhone: string | null }
  | { error: string }
> {
  const customer = order.customers;
  const cust = Array.isArray(customer) ? customer[0] : customer;

  const shipping = order.shipping_address as {
    phone?: string | null;
    name?: string | null;
  } | null;

  let rawPhone =
    (shipping?.phone && String(shipping.phone).trim()) ||
    cust?.phone?.trim() ||
    null;

  let customerName =
    (shipping?.name && String(shipping.name).trim()) ||
    cust?.name?.trim() ||
    null;

  const conversationHint = await findConversationPhone(
    supabase,
    order.store_id,
    order.customer_id
  );

  if (!rawPhone && conversationHint) {
    rawPhone = conversationHint;
  }

  if (
    !rawPhone &&
    order.shopify_order_id &&
    store.shop_domain &&
    store.shopify_access_token
  ) {
    const contact = await fetchShopifyOrderContact(
      store.shop_domain,
      store.shopify_access_token,
      order.shopify_order_id
    );
    if (contact.phone) {
      rawPhone = contact.phone;
      customerName = customerName ?? contact.name;
    }
  }

  if (!rawPhone) {
    return {
      error:
        "No customer phone on this order — cannot send WhatsApp follow-up",
    };
  }

  const to = toWhatsAppRecipient(rawPhone, conversationHint);
  if (!to || to.length < 10) {
    return {
      error: `Invalid customer phone number: ${rawPhone}`,
    };
  }

  return { to, customerName, rawPhone };
}
