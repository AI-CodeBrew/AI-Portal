import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderSource, OrderStatus } from "@/lib/types";

const DEFAULT_LIMIT = 10;
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
    const end =
      dateTo.length <= 10 ? `${dateTo}T23:59:59.999Z` : dateTo;
    q = q.lte("created_at", end);
  }
  return q;
}

async function customerIdsMatchingSearch(
  storeId: string,
  search: string
): Promise<string[]> {
  const supabase = createAdminClient();
  const term = search.trim();
  if (!term) return [];

  const digits = term.replace(/\D/g, "");
  const parts = [`name.ilike.%${term}%`];
  if (digits.length >= 3) {
    parts.push(`phone.ilike.%${digits}%`);
  } else {
    parts.push(`phone.ilike.%${term}%`);
  }

  const { data } = await supabase
    .from("customers")
    .select("id")
    .eq("store_id", storeId)
    .or(parts.join(","))
    .limit(200);

  return (data ?? []).map((c) => c.id as string);
}

function applySearchFilter<
  T extends { or: (filters: string) => T; eq: (c: string, v: string) => T },
>(query: T, search: string, customerIds: string[]): T {
  const term = search.trim();
  if (!term) return query;

  const digits = term.replace(/\D/g, "");
  const clauses: string[] = [`order_number.ilike.%${term}%`];

  if (customerIds.length > 0) {
    clauses.push(`customer_id.in.(${customerIds.join(",")})`);
  }

  // shipping_address JSON fields (PostgREST)
  clauses.push(`shipping_address->>name.ilike.%${term}%`);
  if (digits.length >= 3) {
    clauses.push(`shipping_address->>phone.ilike.%${digits}%`);
  }

  return query.or(clauses.join(","));
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
    const search = (searchParams.get("search") ?? searchParams.get("q") ?? "").trim();
    const offset = (page - 1) * limit;
    const includeCounts = searchParams.get("counts") !== "0";

    const supabase = createAdminClient();

    const { data: store } = await supabase
      .from("stores")
      .select("shopify_access_token")
      .eq("id", storeId)
      .single();
    const shopifyConnected = Boolean(store?.shopify_access_token);

    if (!shopifyConnected && source === "shopify") {
      return NextResponse.json({
        orders: [],
        page,
        limit,
        total: 0,
        totalPages: 1,
        ...(includeCounts
          ? {
              pendingCount: 0,
              statusCounts: {
                all: 0,
                pending: 0,
                confirmed: 0,
                cancelled: 0,
              },
            }
          : {}),
      });
    }

    const customerIds = search
      ? await customerIdsMatchingSearch(storeId, search)
      : [];

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
    } else if (!shopifyConnected) {
      query = query.neq("source", "shopify");
    }
    query = applyDateFilters(query, dateFrom, dateTo);
    if (search) {
      query = applySearchFilter(query, search, customerIds);
    }

    const countBase = () => {
      let q = supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId);
      if (source && source !== "all") {
        q = q.eq("source", source as OrderSource);
      } else if (!shopifyConnected) {
        q = q.neq("source", "shopify");
      }
      q = applyDateFilters(q, dateFrom, dateTo);
      if (search) {
        q = applySearchFilter(q, search, customerIds);
      }
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
