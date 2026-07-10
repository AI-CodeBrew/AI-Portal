import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  deleteStoreProduct,
  ensureProductAdLink,
  getStoreProduct,
  updateStoreProduct,
} from "@/lib/products/products-service";
import type { ProductInput } from "@/lib/products/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { storeId } = await requireResellerStore();
    const { id } = await params;
    const product = await getStoreProduct(storeId, id);
    if (!product) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { storeId } = await requireResellerStore();
    const { id } = await params;
    const body = (await request.json()) as ProductInput & {
      regenerateLink?: boolean;
    };

    if (body.regenerateLink) {
      const link = await ensureProductAdLink(storeId, id);
      if ("error" in link) {
        return NextResponse.json({ error: link.error }, { status: 400 });
      }
      const product = await getStoreProduct(storeId, id);
      return NextResponse.json({ product, whatsapp_url: link.whatsapp_url });
    }

    const result = await updateStoreProduct(storeId, id, body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { storeId } = await requireResellerStore();
    const { id } = await params;
    const result = await deleteStoreProduct(storeId, id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
