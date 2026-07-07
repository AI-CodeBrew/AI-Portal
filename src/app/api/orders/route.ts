import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const { searchParams } = request.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10))
    );
    const status = searchParams.get("status");
    const offset = (page - 1) * limit;

    const supabase = createAdminClient();

    let query = supabase
      .from("orders")
      .select("*, customers(phone, name)", { count: "exact" })
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: orders, error, count } = await query.range(
      offset,
      offset + limit - 1
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { count: pendingCount } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "pending");

    const { count: confirmedCount } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "confirmed");

    const { count: cancelledCount } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "cancelled");

    const { count: allCount } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId);

    const total = count ?? 0;

    return NextResponse.json({
      orders: orders ?? [],
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      pendingCount: pendingCount ?? 0,
      statusCounts: {
        all: allCount ?? 0,
        pending: pendingCount ?? 0,
        confirmed: confirmedCount ?? 0,
        cancelled: cancelledCount ?? 0,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
