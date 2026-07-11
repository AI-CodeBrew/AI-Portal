import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { ensureShopifyProductSku } from "@/lib/products/global-sku";
import { getStoreShopifyProduct } from "@/lib/ads/ad-links-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { storeId } = await requireResellerStore();
    const { id } = await params;
    const productId = Number(id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
    }

    let variantId: string | number | null = null;
    let productTitle: string | null = null;

    const body = await request.json().catch(() => ({}));
    if (body?.variantId != null) variantId = body.variantId;

    const detail = await getStoreShopifyProduct(storeId, productId);
    if (!("error" in detail) && detail.product) {
      productTitle = detail.product.title ?? null;
      if (variantId == null && detail.product.variants?.[0]?.id) {
        variantId = detail.product.variants[0].id;
      }
    }

    const result = await ensureShopifyProductSku({
      storeId,
      shopifyProductId: productId,
      shopifyVariantId: variantId,
      productTitle,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      sku: result.sku,
      created: result.created,
      productId,
      variantId: variantId ? String(variantId) : null,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
