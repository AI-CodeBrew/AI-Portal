import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const supabase = createAdminClient();
    const filter = request.nextUrl.searchParams.get("filter") ?? "all";

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

    const { data: conversations, error } = await query;

    if (error) {
      // Fallback if ai_exhausted column missing
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
        return NextResponse.json({ conversations: retry.data ?? [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ conversations });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
