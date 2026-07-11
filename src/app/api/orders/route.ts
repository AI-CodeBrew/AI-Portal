import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderSource, OrderStatus } from "@/lib/types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function applyDateFilters<T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(
  query: T,
  dateFrom: string | null,
  dateTo: string | null
): T {
  let q = query;
  if (dateFrom) {
    q = q.gte("created_at", dateFrom);
  }
  if (dateTo) {
    // Inclusive end-of-day if date-only (YYYY-MM-DD)
    const end =
      dateTo.length <= 10 ? `${dateTo}T23:59:59.999Z` : dateTo;
    q = q.lte("created_at", end);
  }
  return q;
}

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const { searchParams } = request.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10))
    );
    const status = searchParams.get("status");
    const source = searchParams.get("source");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
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
      query = query.eq("status", status as OrderStatus);
    }
    if (source && source !== "all") {
      query = query.eq("source", source as OrderSource);
    }
    query = applyDateFilters(query, dateFrom, dateTo);

    const countBase = () => {
      let q = supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId);
      if (source && source !== "all") {
        q = q.eq("source", source as OrderSource);
      }
      q = applyDateFilters(q, dateFrom, dateTo);
      return q;
    };

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
      countBase().eq("status", "pending"),
      countBase().eq("status", "confirmed"),
      countBase().eq("status", "cancelled"),
      countBase(),
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
