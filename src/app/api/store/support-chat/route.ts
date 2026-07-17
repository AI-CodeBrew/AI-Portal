import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  clearSupportChat,
  getConversationForStore,
  getOrCreateConversation,
  listMessages,
  markConversationRead,
  sendMessage,
} from "@/lib/support/chat";
import { getStorePlanId } from "@/lib/store/plan-access";
import { planAllowsAdminChat } from "@/lib/ai/plans";

function enterpriseRequiredResponse() {
  return NextResponse.json(
    {
      error:
        "Direct admin chat is included on the Enterprise plan. Upgrade via Plan & Usage or ask your platform admin.",
    },
    { status: 403 }
  );
}

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const planId = await getStorePlanId(storeId);
    if (!planAllowsAdminChat(planId)) {
      return enterpriseRequiredResponse();
    }
    const conversation = await getConversationForStore(storeId);
    if (!conversation) {
      return NextResponse.json({ conversation: null, messages: [] });
    }

    const messages = await listMessages(conversation.id, {
      forRole: "reseller",
    });
    await markConversationRead(conversation.id, "reseller");

    return NextResponse.json({
      conversation: { ...conversation, reseller_unread: false },
      messages,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, storeId } = await requireResellerStore();
    const planId = await getStorePlanId(storeId);
    if (!planAllowsAdminChat(planId)) {
      return enterpriseRequiredResponse();
    }

    const body = (await request.json()) as {
      content?: string;
      action?: "clear";
    };

    if (body.action === "clear") {
      const conversation = await getConversationForStore(storeId);
      if (!conversation) {
        return NextResponse.json({ ok: true, deleted: false, messages: [] });
      }
      const result = await clearSupportChat(conversation.id, "reseller");
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

    const conversation = await getOrCreateConversation(storeId, user.id);
    if ("error" in conversation) {
      return NextResponse.json({ error: conversation.error }, { status: 500 });
    }

    const message = await sendMessage({
      conversationId: conversation.id,
      role: "reseller",
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
