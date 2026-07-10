import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getAdminConversations,
  type AdminChatFilter,
} from "@/lib/admin/chats";

const FILTERS: AdminChatFilter[] = ["all", "ai", "human", "unread"];

export async function GET(request: NextRequest) {
  try {
    await requireAuth("admin");
    const storeId = request.nextUrl.searchParams.get("storeId");
    const filterParam = request.nextUrl.searchParams.get("filter") ?? "all";
    const filter = FILTERS.includes(filterParam as AdminChatFilter)
      ? (filterParam as AdminChatFilter)
      : "all";

    const { conversations, counts } = await getAdminConversations({
      storeId: storeId || null,
      filter,
    });

    return NextResponse.json({ conversations, counts });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
