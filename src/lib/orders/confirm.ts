import { createAdminClient } from "@/lib/supabase/admin";
import {
  confirmOrderOnShopify,
  fetchShopifyOrderContact,
} from "@/lib/shopify";
import { notifyCustomerOrderConfirmed } from "@/lib/orders/notify";
import type { AuthUser } from "@/lib/auth";
import type { Store } from "@/lib/types";

export interface ConfirmOrderResult {
  ok: true;
  confirmed_at: string;
  shopify_sync_status: "synced" | "failed" | "not_applicable";
  shopify_sync_error: string | null;
  whatsapp_sent: boolean;
  whatsapp_method?: "template" | "text";
  whatsapp_error?: string;
}

export async function confirmPortalOrder(
  orderId: string,
  user: AuthUser
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

  let customer = order.customers as {
    phone: string;
    name: string | null;
  } | null;

  let customerPhone = customer?.phone ?? null;
  let customerName = customer?.name ?? null;

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
    customerName,
    orderNumber: order.order_number ?? orderId.slice(0, 8),
    items: order.items as Array<{ title: string; quantity: number }>,
    total: Number(order.total ?? 0),
    currency: order.currency as string | null,
  });

  return {
    ok: true,
    confirmed_at: now,
    shopify_sync_status: shopifySyncStatus,
    shopify_sync_error: shopifySyncError,
    whatsapp_sent: whatsappResult.sent,
    whatsapp_method: whatsappResult.sent ? whatsappResult.method : undefined,
    whatsapp_error: whatsappResult.sent ? undefined : whatsappResult.reason,
  };
}
