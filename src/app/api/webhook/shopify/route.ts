import { NextRequest, NextResponse } from "next/server";
import { verifyHmacSha256 } from "@/lib/crypto";
import {
  resolveShopifySecret,
  type ShopifyOrder,
} from "@/lib/shopify";
import { upsertShopifyOrder } from "@/lib/orders/upsert";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
  const shopDomain = request.headers.get("X-Shopify-Shop-Domain");

  if (!hmac || !shopDomain) {
    return NextResponse.json({ error: "Invalid request" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: store } = await supabase
    .from("stores")
    .select("id, shopify_api_secret")
    .eq("shop_domain", shopDomain)
    .single();

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const secret = resolveShopifySecret(store.shopify_api_secret);
  if (!secret || !verifyHmacSha256(rawBody, hmac, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const topic = request.headers.get("X-Shopify-Topic");
  if (!topic?.startsWith("orders/")) {
    return NextResponse.json({ ok: true });
  }

  try {
    const order = JSON.parse(rawBody) as ShopifyOrder;
    await upsertShopifyOrder(supabase, store.id, order);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Shopify webhook error:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
