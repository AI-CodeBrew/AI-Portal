import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreWithIntegrations } from "@/lib/ads/ad-links-service";
import { getShopCurrency } from "@/lib/shopify";
import { getStoreWhatsAppCredentials } from "@/lib/whatsapp";
import { syncAllShopifyProducts } from "@/lib/shopify-sync-products";

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const limitRaw = Number(
      request.nextUrl.searchParams.get("limit") ?? "10"
    );
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 10, 1), 100);
    const pageRaw = Number(request.nextUrl.searchParams.get("page") ?? "1");
    const page = Math.max(Number.isFinite(pageRaw) ? pageRaw : 1, 1);
    const offset = (page - 1) * limit;

    const supabase = createAdminClient();

    // Check if cache has data for this store
    const { count: cacheCount } = await supabase
      .from("shopify_products_cache")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId);

    // If cache is empty, do an initial sync
    if (!cacheCount || cacheCount === 0) {
      const store = await getStoreWithIntegrations(storeId);
      if (store?.shop_domain && store.shopify_access_token) {
        await syncAllShopifyProducts(
          supabase,
          storeId,
          store.shop_domain,
          store.shopify_access_token
        );
      }
    }

    // Build query
    let query = supabase
      .from("shopify_products_cache")
      .select("*", { count: "exact" })
      .eq("store_id", storeId)
      .order("title", { ascending: true })
      .range(offset, offset + limit - 1);

    if (q) {
      query = query.ilike("title", `%${q}%`);
    }

    const { data: rows, count: totalCount, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get store currency
    const store = await getStoreWithIntegrations(storeId);
    let currency = "USD";
    if (store?.shop_domain && store.shopify_access_token) {
      try {
        currency =
          (await getShopCurrency(store.shop_domain, store.shopify_access_token)) ||
          "USD";
      } catch {
        currency = "USD";
      }
    }

    const waCreds = store ? getStoreWhatsAppCredentials(store) : null;

    const products = (rows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      handle: r.handle,
      status: r.status,
      vendor: r.vendor,
      productType: r.product_type,
      description: r.description,
      imageUrl: r.image_url,
      priceFrom: r.price_from,
      currency: r.currency ?? currency,
      totalInventory: r.total_inventory,
      variantCount: r.variant_count,
    }));

    const total = totalCount ?? 0;
    const hasNextPage = offset + limit < total;
    const hasPreviousPage = page > 1;

    return NextResponse.json({
      products,
      totalCount: total,
      hasNextPage,
      hasPreviousPage,
      nextCursor: null,
      previousCursor: null,
      pageSize: limit,
      currency,
      whatsappConnected: Boolean(waCreds?.phoneNumberId),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
