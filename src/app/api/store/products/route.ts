import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  createStoreProduct,
  listStoreProducts,
} from "@/lib/products/products-service";
import type { ProductInput } from "@/lib/products/types";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const result = await listStoreProducts(storeId);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ products: result.products });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as ProductInput;
    const result = await createStoreProduct(storeId, body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
