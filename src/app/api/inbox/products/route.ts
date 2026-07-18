import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { searchPortalProducts, sampleActiveCatalogProducts } from "@/lib/products/products-service";
import { authErrorResponse } from "@/lib/inbox/inbox-api-auth";

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "8");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(20, Math.max(1, limitRaw))
      : 8;

    const products = q
      ? (await searchPortalProducts(storeId, q)).slice(0, limit)
      : await sampleActiveCatalogProducts(storeId, limit);

    return NextResponse.json({
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        sku: p.sku,
        price: p.price,
        currency: p.currency,
        imageUrl: p.imageUrl,
        variants: p.variants.map((v) => ({
          id: v.id,
          title: v.title,
          sku: v.sku,
          price: v.price,
        })),
      })),
    });
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
