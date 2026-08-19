import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchShopifyOrdersPage,
  getShopifyOrderCount,
} from "@/lib/shopify";
import { upsertShopifyOrder } from "@/lib/orders/upsert";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const supabase = createAdminClient();
    const { data: store } = await supabase
      .from("stores")
      .select("shop_domain, shopify_access_token")
      .eq("id", storeId)
      .single();

    if (!store?.shop_domain || !store.shopify_access_token) {
      return NextResponse.json({ shopifyTotal: 0, connected: false });
    }

    const shopifyTotal = await getShopifyOrderCount(
      store.shop_domain,
      store.shopify_access_token
    );

    return NextResponse.json({ shopifyTotal, connected: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json().catch(() => ({}))) as {
      pageInfo?: string;
      limit?: number;
      /** Sync consecutive pages until Shopify has no more (capped). */
      syncAll?: boolean;
      maxPages?: number;
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

    const limit = Math.min(50, Math.max(1, body.limit ?? 25));
    const shopifyTotal = await getShopifyOrderCount(
      store.shop_domain,
      store.shopify_access_token
    );

    if (!body.syncAll) {
      const page = await fetchShopifyOrdersPage(
        store.shop_domain,
        store.shopify_access_token,
        { limit, pageInfo: body.pageInfo }
      );

      await Promise.all(
        page.orders.map((order) => upsertShopifyOrder(supabase, storeId, order))
      );

      return NextResponse.json({
        ok: true,
        synced: page.orders.length,
        shopifyTotal,
        nextPageInfo: page.nextPageInfo,
        previousPageInfo: page.previousPageInfo,
        done: !page.nextPageInfo,
      });
    }

    // Full sync — page through Shopify until exhausted (safety cap)
    const maxPages = Math.min(
      body.maxPages ?? 200,
      Math.max(1, Math.ceil(shopifyTotal / limit) + 2)
    );
    let pageInfo: string | undefined = body.pageInfo;
    let synced = 0;
    let pages = 0;
    let nextPageInfo: string | null = null;

    while (pages < maxPages) {
      const page = await fetchShopifyOrdersPage(
        store.shop_domain,
        store.shopify_access_token,
        { limit, pageInfo }
      );

      await Promise.all(
        page.orders.map((order) => upsertShopifyOrder(supabase, storeId, order))
      );

      synced += page.orders.length;
      pages += 1;
      nextPageInfo = page.nextPageInfo;
      if (!page.nextPageInfo) break;
      pageInfo = page.nextPageInfo;
    }

    return NextResponse.json({
      ok: true,
      synced,
      pages,
      shopifyTotal,
      nextPageInfo,
      done: !nextPageInfo,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
