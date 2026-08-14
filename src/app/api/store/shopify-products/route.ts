import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { listStoreShopifyProducts } from "@/lib/ads/ad-links-service";

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const cursor = request.nextUrl.searchParams.get("cursor");
    const directionParam = request.nextUrl.searchParams.get("direction");
    const direction =
      directionParam === "prev" ? ("prev" as const) : ("next" as const);
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "10");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 10;

    const result = await listStoreShopifyProducts(storeId, {
      query: q || undefined,
      cursor,
      direction,
      limit,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
