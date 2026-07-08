import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchShopifyOrderTracking,
  setShopifyOrderTracking,
} from "@/lib/shopify";

export interface OrderTrackingState {
  orderId: string;
  orderNumber: string | null;
  shopifyOrderId: string | null;
  trackingNumber: string | null;
  trackingCompany: string | null;
  shopifyFulfillmentId: string | null;
  syncedFromShopify: boolean;
}

export async function getOrderTracking(
  orderId: string,
  storeId: string,
  options?: { refreshFromShopify?: boolean }
): Promise<OrderTrackingState | { error: string; status: number }> {
  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, shopify_order_id, tracking_number, tracking_company, shopify_fulfillment_id, store_id"
    )
    .eq("id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!order) {
    return { error: "Order not found", status: 404 };
  }

  let trackingNumber = order.tracking_number as string | null;
  let trackingCompany = order.tracking_company as string | null;
  let fulfillmentId = order.shopify_fulfillment_id as string | null;
  let syncedFromShopify = false;

  if (options?.refreshFromShopify && order.shopify_order_id) {
    const { data: store } = await supabase
      .from("stores")
      .select("shop_domain, shopify_access_token")
      .eq("id", storeId)
      .single();

    if (store?.shop_domain && store.shopify_access_token) {
      try {
        const shopifyTracking = await fetchShopifyOrderTracking(
          store.shop_domain,
          store.shopify_access_token,
          String(order.shopify_order_id)
        );

        if (
          shopifyTracking.trackingNumber ||
          shopifyTracking.fulfillmentId
        ) {
          trackingNumber = shopifyTracking.trackingNumber;
          trackingCompany = shopifyTracking.trackingCompany;
          fulfillmentId = shopifyTracking.fulfillmentId;
          syncedFromShopify = true;

          await supabase
            .from("orders")
            .update({
              tracking_number: trackingNumber,
              tracking_company: trackingCompany,
              shopify_fulfillment_id: fulfillmentId,
            })
            .eq("id", orderId);
        }
      } catch (err) {
        console.error("[order-tracking] Shopify refresh failed:", err);
      }
    }
  }

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    shopifyOrderId: order.shopify_order_id,
    trackingNumber,
    trackingCompany,
    shopifyFulfillmentId: fulfillmentId,
    syncedFromShopify,
  };
}

export async function updateOrderTracking(
  orderId: string,
  storeId: string,
  input: { trackingNumber: string; trackingCompany?: string | null }
): Promise<
  | (OrderTrackingState & { shopifySynced: boolean })
  | { error: string; status: number }
> {
  const trackingNumber = input.trackingNumber.trim();
  if (!trackingNumber) {
    return { error: "Tracking number is required", status: 400 };
  }

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, shopify_order_id, shopify_fulfillment_id, store_id"
    )
    .eq("id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!order) {
    return { error: "Order not found", status: 404 };
  }

  const { data: store } = await supabase
    .from("stores")
    .select("shop_domain, shopify_access_token")
    .eq("id", storeId)
    .single();

  let fulfillmentId = order.shopify_fulfillment_id as string | null;
  let trackingCompany = input.trackingCompany?.trim() || null;
  let shopifySynced = false;

  if (order.shopify_order_id && store?.shop_domain && store.shopify_access_token) {
    try {
      const result = await setShopifyOrderTracking(
        store.shop_domain,
        store.shopify_access_token,
        String(order.shopify_order_id),
        {
          trackingNumber,
          trackingCompany,
          fulfillmentId,
        }
      );
      fulfillmentId = result.fulfillmentId;
      trackingCompany = result.trackingCompany;
      shopifySynced = true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Shopify tracking sync failed";
      return { error: message, status: 502 };
    }
  }

  const { error } = await supabase
    .from("orders")
    .update({
      tracking_number: trackingNumber,
      tracking_company: trackingCompany,
      shopify_fulfillment_id: fulfillmentId,
    })
    .eq("id", orderId);

  if (error) {
    const hint = error.message.includes("tracking_number")
      ? " — Run migration 008_order_tracking.sql in Supabase"
      : "";
    return { error: error.message + hint, status: 500 };
  }

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    shopifyOrderId: order.shopify_order_id,
    trackingNumber,
    trackingCompany,
    shopifyFulfillmentId: fulfillmentId,
    syncedFromShopify: shopifySynced,
    shopifySynced,
  };
}
