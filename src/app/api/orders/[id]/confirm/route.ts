import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmOrderOnShopify } from "@/lib/shopify";
import {
  getStoreWhatsAppCredentials,
  sendWhatsAppTemplate,
  formatOrderConfirmationParams,
} from "@/lib/whatsapp";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, storeId } = await requireResellerStore();
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*, customers(phone, name)")
      .eq("id", id)
      .eq("store_id", storeId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status === "confirmed") {
      return NextResponse.json({ error: "Already confirmed" }, { status: 400 });
    }

    const { data: store } = await supabase
      .from("stores")
      .select("*")
      .eq("id", storeId)
      .single();

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
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
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const customer = order.customers as {
      phone: string;
      name: string | null;
    } | null;
    const waCreds = getStoreWhatsAppCredentials(store);

    if (waCreds && customer?.phone) {
      try {
        const bodyParams = formatOrderConfirmationParams(
          order.order_number ?? id.slice(0, 8),
          order.items as Array<{ title: string; quantity: number }>,
          Number(order.total ?? 0),
          order.currency as string | null
        );

        await sendWhatsAppTemplate({
          phoneNumberId: waCreds.phoneNumberId,
          accessToken: waCreds.accessToken,
          to: customer.phone,
          templateName: "order_confirmed",
          bodyParams,
        });
      } catch (err) {
        console.error("WhatsApp confirmation failed:", err);
      }
    }

    return NextResponse.json({
      ok: true,
      confirmed_at: now,
      shopify_sync_status: shopifySyncStatus,
      shopify_sync_error: shopifySyncError,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
