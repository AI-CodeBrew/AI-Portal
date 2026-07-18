import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { deleteStoreConversations } from "@/lib/inbox/conversation-delete";

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as { ids?: unknown };
    const rawIds = body.ids;

    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json(
        { error: "At least one conversation id is required" },
        { status: 400 }
      );
    }

    const ids = rawIds.filter((id): id is string => typeof id === "string");
    if (!ids.length) {
      return NextResponse.json(
        { error: "Invalid conversation ids" },
        { status: 400 }
      );
    }

    const result = await deleteStoreConversations(storeId, ids);

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "No conversations found to delete", notFoundIds: result.notFoundIds },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      deletedCount: result.deletedCount,
      notFoundIds: result.notFoundIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "UNAUTHORIZED" || message === "FORBIDDEN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: message || "Failed to delete conversations" },
      { status: 500 }
    );
  }
}
