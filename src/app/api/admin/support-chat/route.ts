import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  clearSupportChat,
  getConversationForStore,
  getOrCreateConversation,
  listMessages,
  listSupportConversations,
  markConversationRead,
  sendMessage,
} from "@/lib/support/chat";

export async function GET(request: NextRequest) {
  try {
    await requireAuth("admin");
    const storeId = request.nextUrl.searchParams.get("storeId");

    if (!storeId) {
      const conversations = await listSupportConversations();
      return NextResponse.json({ conversations });
    }

    const conversation = await getConversationForStore(storeId);
    if (!conversation) {
      return NextResponse.json({ conversation: null, messages: [] });
    }

    const messages = await listMessages(conversation.id, { forRole: "admin" });
    await markConversationRead(conversation.id, "admin");

    return NextResponse.json({
      conversation: { ...conversation, admin_unread: false },
      messages,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth("admin");
    const body = (await request.json()) as {
      storeId?: string;
      content?: string;
      action?: "clear";
    };

    if (!body.storeId) {
      return NextResponse.json(
        { error: "storeId is required" },
        { status: 400 }
      );
    }

    if (body.action === "clear") {
      const conversation = await getConversationForStore(body.storeId);
      if (!conversation) {
        return NextResponse.json({ ok: true, deleted: false, messages: [] });
      }
      const result = await clearSupportChat(conversation.id, "admin");
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        deleted: result.deleted,
        messages: [],
      });
    }

    if (!body.content?.trim()) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    const conversation = await getOrCreateConversation(body.storeId);
    if ("error" in conversation) {
      return NextResponse.json({ error: conversation.error }, { status: 500 });
    }

    const message = await sendMessage({
      conversationId: conversation.id,
      role: "admin",
      content: body.content,
      senderUserId: user.id,
    });

    if ("error" in message) {
      return NextResponse.json({ error: message.error }, { status: 400 });
    }

    return NextResponse.json({ message, conversationId: conversation.id });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
