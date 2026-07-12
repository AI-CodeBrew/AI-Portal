import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/whatsapp";

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
};

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const supabase = createAdminClient();
    const filter = request.nextUrl.searchParams.get("filter") ?? "all";
    const search = (request.nextUrl.searchParams.get("q") ?? "").trim();

    let query = supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("store_id", storeId)
      .neq("status", "closed")
      .order("updated_at", { ascending: false });

    if (filter === "handoff") {
      query = query.eq("status", "human_handoff").eq("ai_exhausted", false);
    } else if (filter === "ai") {
      query = query.eq("status", "ai_handling");
    } else if (filter === "exhausted") {
      query = query.eq("ai_exhausted", true);
    }

    let { data: conversations, error } = await query;

    if (error) {
      if (error.message.includes("ai_exhausted") && filter === "exhausted") {
        return NextResponse.json({ conversations: [] });
      }
      if (error.message.includes("ai_exhausted")) {
        let fallback = supabase
          .from("whatsapp_conversations")
          .select("*")
          .eq("store_id", storeId)
          .neq("status", "closed")
          .order("updated_at", { ascending: false });
        if (filter === "handoff") {
          fallback = fallback.eq("status", "human_handoff");
        } else if (filter === "ai") {
          fallback = fallback.eq("status", "ai_handling");
        }
        const retry = await fallback;
        conversations = retry.data ?? [];
        error = retry.error;
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

      // Also try matching without relying on exact phone format in DB
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
      };
    });

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

    return NextResponse.json({ conversations: enriched });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
