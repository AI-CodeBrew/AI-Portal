import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchShopifyOrdersPage,
  getShopifyOrderCount,
} from "@/lib/shopify";
import { upsertShopifyOrder } from "@/lib/orders/upsert";

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json().catch(() => ({}))) as {
      pageInfo?: string;
      limit?: number;
    };

    const supabase = createAdminClient();
    const { data: store } = await supabase
      .from("stores")
      .select("shop_domain, shopify_access_token")
      .eq("id", storeId)
      .single();

    if (!store?.shop_domain || !store.shopify_access_token) {
      return NextResponse.json(
        { error: "Shopify not connected. Go to Integrations → Shopify." },
        { status: 400 }
      );
    }

    const limit = body.limit ?? 25;

    const [shopifyTotal, page] = await Promise.all([
      getShopifyOrderCount(store.shop_domain, store.shopify_access_token),
      fetchShopifyOrdersPage(store.shop_domain, store.shopify_access_token, {
        limit,
        pageInfo: body.pageInfo,
      }),
    ]);

    for (const order of page.orders) {
      await upsertShopifyOrder(supabase, storeId, order);
    }

    return NextResponse.json({
      ok: true,
      synced: page.orders.length,
      shopifyTotal,
      nextPageInfo: page.nextPageInfo,
      previousPageInfo: page.previousPageInfo,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
