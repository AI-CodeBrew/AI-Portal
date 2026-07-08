import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  ADMIN_ORDERS_PAGE_SIZE,
  getAdminOrders,
} from "@/lib/admin/orders";

export async function GET(request: NextRequest) {
  try {
    await requireAuth("admin");

    const { searchParams } = request.nextUrl;
    const storeId = searchParams.get("storeId") ?? undefined;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(
      100,
      Math.max(
        1,
        Number(searchParams.get("pageSize") ?? String(ADMIN_ORDERS_PAGE_SIZE)) ||
          ADMIN_ORDERS_PAGE_SIZE
      )
    );

    const result = await getAdminOrders({ storeId, page, pageSize });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
