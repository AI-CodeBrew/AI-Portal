import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getAdminConversationMessages,
  markAdminConversationRead,
} from "@/lib/admin/chats";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireAuth("admin");
    const conversationId = request.nextUrl.searchParams.get("conversationId");
    const markRead = request.nextUrl.searchParams.get("markRead") !== "0";

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const messages = await getAdminConversationMessages(conversationId);

    let markedRead = false;
    if (markRead) {
      const result = await markAdminConversationRead(conversationId);
      markedRead = !("error" in result);
    }

    return NextResponse.json({ messages, markedRead });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
