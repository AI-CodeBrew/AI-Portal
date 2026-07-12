import { createAdminClient } from "@/lib/supabase/admin";
import {
  confirmOrderOnShopify,
  fetchShopifyOrderContact,
} from "@/lib/shopify";
import { notifyCustomerOrderConfirmed } from "@/lib/orders/notify";
import { sendOrderFollowUp } from "@/lib/orders/follow-up";
import { toWhatsAppRecipient } from "@/lib/whatsapp";
import type { AuthUser } from "@/lib/auth";
import type { Store } from "@/lib/types";

export type ConfirmActor =
  | AuthUser
  | { email: string; role: "system"; storeId: string; id?: string };

export interface ConfirmOrderResult {
  ok: true;
  confirmed_at: string;
  shopify_sync_status: "synced" | "failed" | "not_applicable";
  shopify_sync_error: string | null;
  whatsapp_sent: boolean;
  whatsapp_method?: "template" | "text";
  whatsapp_error?: string;
  follow_up_sent?: boolean;
  follow_up_error?: string;
}

export async function confirmPortalOrder(
  orderId: string,
  user: ConfirmActor,
  options?: {
    followUpTemplateId?: string | null;
    /** WhatsApp chat number (msg.from) — country hint + delivery fallback */
    conversationPhone?: string | null;
  }
): Promise<ConfirmOrderResult | { error: string; status: number }> {
  const supabase = createAdminClient();

  let orderQuery = supabase
    .from("orders")
    .select("*, customers(phone, name)")
    .eq("id", orderId);

  if (user.role === "reseller") {
    if (!user.storeId) {
      return { error: "No store linked", status: 403 };
    }
    orderQuery = orderQuery.eq("store_id", user.storeId);
  } else if (user.role === "system") {
    orderQuery = orderQuery.eq("store_id", user.storeId);
  }

  const { data: order, error: orderError } = await orderQuery.single();

  if (orderError || !order) {
    return { error: "Order not found", status: 404 };
  }

  if (order.status === "confirmed") {
    return { error: "Already confirmed", status: 400 };
  }

  const storeId = order.store_id as string;
  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .single();

  if (!store) {
    return { error: "Store not found", status: 404 };
  }

  let shopifySyncStatus: "synced" | "failed" | "not_applicable" =
    "not_applicable";
  let shopifySyncError: string | null = null;
  let shopifyOrderId = order.shopify_order_id as string | null;

  if (
    store.shop_domain &&
    store.shopify_access_token &&
    (order.shopify_order_id || order.shopify_draft_order_id)
  ) {
    const shopifyResult = await confirmOrderOnShopify(
      store.shop_domain,
      store.shopify_access_token,
      {
        shopify_order_id: order.shopify_order_id,
        shopify_draft_order_id: order.shopify_draft_order_id,
      },
      user.email
    );

    if (shopifyResult.ok) {
      shopifySyncStatus = "synced";
      if (shopifyResult.shopifyOrderId) {
        shopifyOrderId = shopifyResult.shopifyOrderId;
      }
    } else {
      shopifySyncStatus = "failed";
      shopifySyncError = shopifyResult.error ?? "Shopify sync failed";
    }
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "confirmed",
      confirmed_by: user.email,
      confirmed_at: now,
      shopify_order_id: shopifyOrderId,
      shopify_sync_status: shopifySyncStatus,
      shopify_sync_error: shopifySyncError,
    })
    .eq("id", orderId);

  if (updateError) {
    return { error: updateError.message, status: 500 };
  }

  const customer = order.customers as {
    phone: string;
    name: string | null;
  } | null;

  const shipping = order.shipping_address as {
    phone?: string | null;
    name?: string | null;
  } | null;

  // Prefer phone the customer shared on the order (shipping), then linked customer
  let customerPhone =
    (shipping?.phone && String(shipping.phone).trim()) ||
    customer?.phone ||
    null;
  let customerName =
    (shipping?.name && String(shipping.name).trim()) ||
    customer?.name ||
    null;

  if (customerPhone) {
    customerPhone = toWhatsAppRecipient(
      customerPhone,
      options?.conversationPhone
    );
  }

  if (
    !customerPhone &&
    shopifyOrderId &&
    store.shop_domain &&
    store.shopify_access_token
  ) {
    const contact = await fetchShopifyOrderContact(
      store.shop_domain,
      store.shopify_access_token,
      shopifyOrderId
    );
    if (contact.phone) {
      customerPhone = contact.phone;
      customerName = customerName ?? contact.name;

      const { data: cust } = await supabase
        .from("customers")
        .upsert(
          {
            store_id: storeId,
            phone: contact.phone,
            name: contact.name,
          },
          { onConflict: "store_id,phone" }
        )
        .select("id")
        .single();

      if (cust?.id) {
        await supabase
          .from("orders")
          .update({ customer_id: cust.id })
          .eq("id", orderId);
      }
    }
  }

  const whatsappResult = await notifyCustomerOrderConfirmed({
    store: store as Store,
    customerPhone,
    conversationPhone: options?.conversationPhone ?? null,
    customerName,
    orderNumber: order.order_number ?? orderId.slice(0, 8),
    items: order.items as Array<{ title: string; quantity: number }>,
    total: Number(order.total ?? 0),
    currency: order.currency as string | null,
  });

  let followUpSent = false;
  let followUpError: string | undefined;
  const followUpTemplateId =
    options?.followUpTemplateId ??
    (store.auto_follow_up_template_id as string | null) ??
    null;

  if (followUpTemplateId && user.role !== "admin") {
    const actor: AuthUser =
      user.role === "system"
        ? {
            id: user.id ?? "system",
            email: user.email,
            role: "reseller",
            fullName: null,
            storeId,
          }
        : user;
    const follow = await sendOrderFollowUp(orderId, actor, followUpTemplateId);
    if ("error" in follow) {
      followUpError = follow.error;
    } else {
      followUpSent = true;
    }
  }

  return {
    ok: true,
    confirmed_at: now,
    shopify_sync_status: shopifySyncStatus,
    shopify_sync_error: shopifySyncError,
    whatsapp_sent: whatsappResult.sent,
    whatsapp_method: whatsappResult.sent ? whatsappResult.method : undefined,
    whatsapp_error: whatsappResult.sent ? undefined : whatsappResult.reason,
    follow_up_sent: followUpSent,
    follow_up_error: followUpError,
  };
}

/** Auto-confirm a newly imported Shopify order when store setting is on. */
export async function maybeAutoConfirmShopifyOrder(
  storeId: string,
  orderId: string
): Promise<void> {
  const supabase = createAdminClient();
  const { data: store } = await supabase
    .from("stores")
    .select("auto_confirm_orders, auto_follow_up_template_id")
    .eq("id", storeId)
    .maybeSingle();

  if (!store?.auto_confirm_orders) return;

  const result = await confirmPortalOrder(
    orderId,
    {
      email: "auto-confirm@system",
      role: "system",
      storeId,
    },
    {
      followUpTemplateId:
        (store.auto_follow_up_template_id as string | null) ?? null,
    }
  );

  if ("error" in result) {
    console.error(
      `[auto-confirm] order=${orderId} failed: ${result.error}`
    );
  }
}
