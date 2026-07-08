import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminOrders } from "@/lib/admin/orders";

export async function GET(request: NextRequest) {
  try {
    await requireAuth("admin");
    const storeId = request.nextUrl.searchParams.get("storeId") ?? undefined;
    const orders = await getAdminOrders(storeId);
    return NextResponse.json({ orders });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
