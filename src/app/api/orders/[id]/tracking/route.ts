import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { getOrderTracking, updateOrderTracking } from "@/lib/orders/tracking";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { storeId } = await requireResellerStore();
    const { id } = await params;
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";

    const result = await getOrderTracking(id, storeId, {
      refreshFromShopify: refresh,
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ tracking: result });
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
    const body = (await request.json()) as {
      trackingNumber?: string;
      trackingCompany?: string | null;
    };

    const result = await updateOrderTracking(id, storeId, {
      trackingNumber: body.trackingNumber ?? "",
      trackingCompany: body.trackingCompany,
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ tracking: result });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
