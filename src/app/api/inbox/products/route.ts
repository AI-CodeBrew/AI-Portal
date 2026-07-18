import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchInboxCatalogProducts, loadShopifyProductForInboxSend } from "@/lib/inbox/inbox-product-search";
import { authErrorResponse } from "@/lib/inbox/inbox-api-auth";
import type { Store } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const shopifyProductId =
      request.nextUrl.searchParams.get("shopifyProductId")?.trim() ?? "";
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "8");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(20, Math.max(1, limitRaw))
      : 8;

    const supabase = createAdminClient();
    const { data: storeRow, error: storeError } = await supabase
      .from("stores")
      .select("*")
      .eq("id", storeId)
      .single();

    if (storeError || !storeRow) {
      return NextResponse.json({ error: "Store not found" }, { status: 400 });
    }

    if (shopifyProductId) {
      const product = await loadShopifyProductForInboxSend(
        storeRow as Store,
        shopifyProductId
      );
      return NextResponse.json({ products: product ? [product] : [] });
    }

    const products = await searchInboxCatalogProducts(
      storeRow as Store,
      q,
      limit
    );

    return NextResponse.json({ products });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("[inbox/products]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to search products" },
      { status: 500 }
    );
  }
}
