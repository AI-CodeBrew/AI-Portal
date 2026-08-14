import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/whatsapp";
import { getWindowStatus } from "@/lib/whatsapp-window/window-status";
import type { WindowType } from "@/lib/whatsapp-window/window-status";

export type InboxConversation = {
  id: string;
  store_id: string;
  customer_id: string | null;
  customer_phone: string;
  customer_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  ai_exhausted?: boolean | null;
  last_customer_message_at: string | null;
  window_type: WindowType;
  marketing_opt_in: boolean;
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const supabase = createAdminClient();
    const filter = request.nextUrl.searchParams.get("filter") ?? "all";
    const search = (request.nextUrl.searchParams.get("q") ?? "").trim();
    const page = Math.max(
      1,
      parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1
    );
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(
        1,
        parseInt(
          request.nextUrl.searchParams.get("limit") ?? String(DEFAULT_LIMIT),
          10
        ) || DEFAULT_LIMIT
      )
    );

    // closing_soon / search need post-filtering — load candidates then page.
    // Other filters can use DB range after we know we don't need full enrich first.
    const needsPostFilter = filter === "closing_soon" || Boolean(search);

    let query = supabase
      .from("whatsapp_conversations")
      .select("*", needsPostFilter ? undefined : { count: "exact" })
      .eq("store_id", storeId)
      .neq("status", "closed")
      .order("updated_at", { ascending: false });

    if (filter === "handoff") {
      query = query.eq("status", "human_handoff").eq("ai_exhausted", false);
    } else if (filter === "ai") {
      query = query.eq("status", "ai_handling");
    } else if (filter === "exhausted") {
      query = query.eq("ai_exhausted", true);
    } else if (filter === "closing_soon") {
      query = query
        .not("last_customer_message_at", "is", null)
        .order("last_customer_message_at", { ascending: true });
    }

    if (!needsPostFilter) {
      const from = (page - 1) * limit;
      query = query.range(from, from + limit - 1);
    }

    let { data: conversations, error, count } = await query;

    if (error) {
      if (error.message.includes("ai_exhausted") && filter === "exhausted") {
        return NextResponse.json({
          conversations: [],
          total: 0,
          page,
          limit,
          totalPages: 1,
        });
      }
      if (
        error.message.includes("ai_exhausted") ||
        error.message.includes("last_customer_message_at")
      ) {
        let fallback = supabase
          .from("whatsapp_conversations")
          .select("*", needsPostFilter ? undefined : { count: "exact" })
          .eq("store_id", storeId)
          .neq("status", "closed")
          .order("updated_at", { ascending: false });
        if (filter === "handoff") {
          fallback = fallback.eq("status", "human_handoff");
        } else if (filter === "ai") {
          fallback = fallback.eq("status", "ai_handling");
        }
        if (!needsPostFilter) {
          const from = (page - 1) * limit;
          fallback = fallback.range(from, from + limit - 1);
        }
        const retry = await fallback;
        conversations = retry.data ?? [];
        error = retry.error;
        count = retry.count;
      }
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const rows = conversations ?? [];
    const phones = [
      ...new Set(
        rows.map((c) => normalizePhone(String(c.customer_phone ?? "")))
      ),
    ].filter(Boolean);

    const nameByPhone = new Map<string, string>();
    if (phones.length > 0) {
      const { data: customers } = await supabase
        .from("customers")
        .select("phone, name")
        .eq("store_id", storeId)
        .in("phone", phones);

      for (const c of customers ?? []) {
        const phone = normalizePhone(String(c.phone ?? ""));
        const name = (c.name as string | null)?.trim();
        if (phone && name) nameByPhone.set(phone, name);
      }

      if (nameByPhone.size < phones.length) {
        const { data: allCustomers } = await supabase
          .from("customers")
          .select("phone, name")
          .eq("store_id", storeId);
        for (const c of allCustomers ?? []) {
          const phone = normalizePhone(String(c.phone ?? ""));
          const name = (c.name as string | null)?.trim();
          if (phone && name && !nameByPhone.has(phone)) {
            nameByPhone.set(phone, name);
          }
        }
      }
    }

    let enriched: InboxConversation[] = rows.map((c) => {
      const phone = normalizePhone(String(c.customer_phone ?? ""));
      return {
        id: c.id as string,
        store_id: c.store_id as string,
        customer_id: (c.customer_id as string | null) ?? null,
        customer_phone: phone || String(c.customer_phone ?? ""),
        customer_name: nameByPhone.get(phone) ?? null,
        status: c.status as string,
        created_at: c.created_at as string,
        updated_at: c.updated_at as string,
        ai_exhausted: (c.ai_exhausted as boolean | null) ?? null,
        last_customer_message_at:
          (c.last_customer_message_at as string | null) ?? null,
        window_type: ((c.window_type as WindowType | null) ??
          "service") as WindowType,
        marketing_opt_in: Boolean(c.marketing_opt_in),
      };
    });

    if (filter === "closing_soon") {
      enriched = enriched
        .map((c) => ({
          c,
          window: getWindowStatus(c.last_customer_message_at, c.window_type),
        }))
        .filter(({ window }) => window.urgency === "closing_soon")
        .sort((a, b) => a.window.msRemaining - b.window.msRemaining)
        .map(({ c }) => c);
    }

    if (search) {
      const q = search.toLowerCase();
      const qDigits = normalizePhone(search);
      enriched = enriched.filter((c) => {
        const name = (c.customer_name ?? "").toLowerCase();
        const phone = c.customer_phone;
        return (
          name.includes(q) ||
          phone.includes(qDigits) ||
          phone.includes(q) ||
          `+${phone}`.includes(q)
        );
      });
    }

    let total: number;
    let pageRows: InboxConversation[];

    if (needsPostFilter) {
      total = enriched.length;
      const from = (page - 1) * limit;
      pageRows = enriched.slice(from, from + limit);
    } else {
      total = count ?? enriched.length;
      pageRows = enriched;
    }

    const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

    return NextResponse.json({
      conversations: pageRows,
      total,
      page,
      limit,
      totalPages,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
