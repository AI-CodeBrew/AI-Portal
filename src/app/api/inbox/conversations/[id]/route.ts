import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { deleteStoreConversations } from "@/lib/inbox/conversation-delete";

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

    const result = await deleteStoreConversations(storeId, [id]);

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
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
