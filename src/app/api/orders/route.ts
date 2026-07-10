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
    const includeCounts = searchParams.get("counts") !== "0";

    const supabase = createAdminClient();

    let query = supabase
      .from("orders")
      .select("*, customers(phone, name)", { count: "exact" })
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (!includeCounts) {
      const { data: orders, error, count } = await query;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const total = count ?? 0;
      return NextResponse.json({
        orders: orders ?? [],
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      });
    }

    const [
      pageRes,
      pendingRes,
      confirmedRes,
      cancelledRes,
      allRes,
    ] = await Promise.all([
      query,
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("status", "pending"),
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("status", "confirmed"),
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("status", "cancelled"),
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId),
    ]);

    if (pageRes.error) {
      return NextResponse.json(
        { error: pageRes.error.message },
        { status: 500 }
      );
    }

    const total = pageRes.count ?? 0;

    return NextResponse.json({
      orders: pageRes.data ?? [],
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      pendingCount: pendingRes.count ?? 0,
      statusCounts: {
        all: allRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        confirmed: confirmedRes.count ?? 0,
        cancelled: cancelledRes.count ?? 0,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
