import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderSource, OrderStatus } from "@/lib/types";

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "";
  const a = addr as Record<string, unknown>;
  return [a.address1, a.address2, a.city, a.province, a.zip, a.country]
    .filter((x) => typeof x === "string" && x.trim())
    .join(", ");
}

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const { searchParams } = request.nextUrl;
    const source = searchParams.get("source");
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const supabase = createAdminClient();
    let query = supabase
      .from("orders")
      .select(
        "order_number, status, source, total, currency, created_at, shipping_address, customers(phone, name), items"
      )
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (source && source !== "all") {
      query = query.eq("source", source as OrderSource);
    }
    if (status && status !== "all") {
      query = query.eq("status", status as OrderStatus);
    }
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) {
      const end =
        dateTo.length <= 10 ? `${dateTo}T23:59:59.999Z` : dateTo;
      query = query.lte("created_at", end);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const headers = [
      "order_number",
      "status",
      "source",
      "customer_name",
      "customer_phone",
      "total",
      "currency",
      "shipping_address",
      "items",
      "created_at",
    ];

    const rows = (data ?? []).map((row) => {
      const customer = Array.isArray(row.customers)
        ? row.customers[0]
        : row.customers;
      const items = Array.isArray(row.items)
        ? (row.items as Array<{ title?: string; quantity?: number }>)
            .map((i) => `${i.quantity ?? 1}x ${i.title ?? ""}`)
            .join("; ")
        : "";
      return [
        row.order_number,
        row.status,
        row.source,
        customer?.name ?? "",
        customer?.phone ?? "",
        row.total,
        row.currency,
        formatAddress(row.shipping_address),
        items,
        row.created_at,
      ]
        .map(csvEscape)
        .join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const filename = `orders-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
