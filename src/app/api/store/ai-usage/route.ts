import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  getStoreAiUsage,
  updateConversationReplyLimit,
  updateConversationReplyWindowHours,
} from "@/lib/ai/quota";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const usage = await getStoreAiUsage(storeId);
    return NextResponse.json({ usage });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      conversationReplyLimit?: number | null;
      conversationReplyWindowHours?: number | null;
    };

    if (body.conversationReplyLimit !== undefined) {
      const result = await updateConversationReplyLimit(
        storeId,
        body.conversationReplyLimit
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error ?? "Failed to update" },
          { status: 400 }
        );
      }
    }

    if (body.conversationReplyWindowHours !== undefined) {
      const result = await updateConversationReplyWindowHours(
        storeId,
        body.conversationReplyWindowHours
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error ?? "Failed to update" },
          { status: 400 }
        );
      }
    }

    const usage = await getStoreAiUsage(storeId);
    return NextResponse.json({ usage });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
