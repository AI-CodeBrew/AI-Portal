import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchShopifyOrderContact } from "@/lib/shopify";
import {
  buildWhatsAppRecipientTargets,
  phoneVariants,
} from "@/lib/phone";

type OrderRow = {
  id: string;
  store_id: string;
  customer_id: string | null;
  shopify_order_id: string | null;
  source?: string | null;
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
  customerId: string | null,
  phoneHints: string[]
): Promise<string | null> {
  if (customerId) {
    const { data } = await supabase
      .from("whatsapp_conversations")
      .select("customer_phone")
      .eq("store_id", storeId)
      .eq("customer_id", customerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const linked = (data?.customer_phone as string | null)?.trim();
    if (linked) return linked;
  }

  const variants = new Set<string>();
  for (const raw of phoneHints) {
    for (const v of phoneVariants(raw)) {
      variants.add(v);
    }
  }

  if (variants.size === 0) return null;

  const { data: rows } = await supabase
    .from("whatsapp_conversations")
    .select("customer_phone")
    .eq("store_id", storeId)
    .in("customer_phone", Array.from(variants))
    .order("updated_at", { ascending: false })
    .limit(1);

  const match = rows?.[0]?.customer_phone as string | undefined;
  return match?.trim() || null;
}

export async function findOrderConversationId(
  supabase: SupabaseClient,
  storeId: string,
  customerId: string | null,
  recipientPhone: string,
  extraPhones: string[] = []
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

  const variants = new Set<string>();
  for (const raw of [recipientPhone, ...extraPhones]) {
    for (const v of phoneVariants(raw)) {
      variants.add(v);
    }
  }

  if (variants.size === 0) return null;

  const { data: rows } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("store_id", storeId)
    .in("customer_phone", Array.from(variants))
    .order("updated_at", { ascending: false })
    .limit(1);

  return (rows?.[0]?.id as string | null) ?? null;
}

/**
 * Resolve WhatsApp delivery targets for an order — conversation chat number first,
 * then shipping / customer / Shopify contact (each normalized).
 */
export async function resolveOrderWhatsAppTargets(
  supabase: SupabaseClient,
  order: OrderRow,
  store: StoreRow
): Promise<
  | { targets: string[]; customerName: string | null; conversationPhone: string | null }
  | { error: string }
> {
  const customer = order.customers;
  const cust = Array.isArray(customer) ? customer[0] : customer;

  const shipping = order.shipping_address as {
    phone?: string | null;
    name?: string | null;
  } | null;

  const shippingPhone = shipping?.phone?.trim() || null;
  const customerPhone = cust?.phone?.trim() || null;

  let customerName =
    (shipping?.name && String(shipping.name).trim()) ||
    cust?.name?.trim() ||
    null;

  const phoneHints = [shippingPhone, customerPhone].filter(
    (p): p is string => Boolean(p)
  );

  let conversationPhone = await findConversationPhone(
    supabase,
    order.store_id,
    order.customer_id,
    phoneHints
  );

  let shopifyPhone: string | null = null;
  if (
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
      shopifyPhone = contact.phone;
      customerName = customerName ?? contact.name;
    }
  }

  const orderPhones =
    order.source === "whatsapp_ai"
      ? [shippingPhone, customerPhone, shopifyPhone]
      : [shippingPhone, customerPhone, shopifyPhone];

  const targets = buildWhatsAppRecipientTargets(orderPhones, conversationPhone);

  if (targets.length === 0) {
    return {
      error:
        "No customer phone on this order — cannot send WhatsApp follow-up",
    };
  }

  return { targets, customerName, conversationPhone };
}

/** @deprecated Prefer resolveOrderWhatsAppTargets — kept for single-target callers */
export async function resolveOrderWhatsAppRecipient(
  supabase: SupabaseClient,
  order: OrderRow,
  store: StoreRow
): Promise<
  | { to: string; customerName: string | null; rawPhone: string | null }
  | { error: string }
> {
  const resolved = await resolveOrderWhatsAppTargets(supabase, order, store);
  if ("error" in resolved) return resolved;

  return {
    to: resolved.targets[0]!,
    customerName: resolved.customerName,
    rawPhone: resolved.targets[0] ?? null,
  };
}
