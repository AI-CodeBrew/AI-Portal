import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { searchAdProducts } from "@/lib/ads/ad-links-service";

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
      return NextResponse.json(
        { error: "Enter at least 2 characters to search" },
        { status: 400 }
      );
    }

    const result = await searchAdProducts(storeId, q);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      products: result.products,
      currency: result.currency,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
