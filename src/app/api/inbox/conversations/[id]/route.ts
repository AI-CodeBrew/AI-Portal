import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { storeId } = await requireResellerStore();
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Conversation id required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: conversation, error: findError } = await supabase
      .from("whatsapp_conversations")
      .select("id")
      .eq("id", id)
      .eq("store_id", storeId)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Messages cascade-delete via FK on whatsapp_messages.conversation_id
    const { error: deleteError } = await supabase
      .from("whatsapp_conversations")
      .delete()
      .eq("id", id)
      .eq("store_id", storeId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "UNAUTHORIZED" || message === "FORBIDDEN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: message || "Failed to delete conversation" },
      { status: 500 }
    );
  }
}
