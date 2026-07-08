import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConversationStatus } from "@/lib/types";

export async function PATCH(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      conversationId?: string;
      mode?: "ai" | "manual";
    };

    if (!body.conversationId || !body.mode) {
      return NextResponse.json(
        { error: "conversationId and mode are required" },
        { status: 400 }
      );
    }

    const newStatus: ConversationStatus =
      body.mode === "manual" ? "human_handoff" : "ai_handling";

    const supabase = createAdminClient();

    const { data: conversation, error } = await supabase
      .from("whatsapp_conversations")
      .update({ status: newStatus })
      .eq("id", body.conversationId)
      .eq("store_id", storeId)
      .select("id, status")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      status: conversation.status,
      mode: conversation.status === "human_handoff" ? "manual" : "ai",
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
