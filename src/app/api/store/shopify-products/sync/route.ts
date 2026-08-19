import { NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreWithIntegrations } from "@/lib/ads/ad-links-service";
import { syncAllShopifyProducts } from "@/lib/shopify-sync-products";

export async function POST() {
  try {
    const { storeId } = await requireResellerStore();
    const store = await getStoreWithIntegrations(storeId);

    if (!store?.shop_domain || !store.shopify_access_token) {
      return NextResponse.json(
        { error: "Connect Shopify in Integrations first." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const result = await syncAllShopifyProducts(
      supabase,
      storeId,
      store.shop_domain,
      store.shopify_access_token
    );

    if (result.error) {
      return NextResponse.json(
        { error: result.error, count: result.count },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, count: result.count });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
