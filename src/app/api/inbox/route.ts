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
      query = query.eq("status", "human_handoff");
    } else if (filter === "ai") {
      query = query.eq("status", "ai_handling");
    }

    const { data: conversations, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ conversations });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
