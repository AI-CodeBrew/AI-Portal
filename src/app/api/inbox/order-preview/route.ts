import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  authErrorResponse,
  loadOwnedConversation,
} from "@/lib/inbox/inbox-api-auth";
import {
  buildManualOrderPreview,
  loadConversationChatHistory,
} from "@/lib/inbox/manual-order";

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const conversationId = request.nextUrl.searchParams.get("conversationId")?.trim();
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const loaded = await loadOwnedConversation({
      storeId,
      conversationId,
      requireManual: true,
    });
    if ("error" in loaded && loaded.error) return loaded.error;

    const { conversation } = loaded;
    const history = await loadConversationChatHistory(conversationId);
    const preview = await buildManualOrderPreview({
      storeId,
      customerPhone: String(conversation.customer_phone),
      history,
    });

    return NextResponse.json({ preview });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("[inbox/order-preview]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load order preview" },
      { status: 500 }
    );
  }
}
