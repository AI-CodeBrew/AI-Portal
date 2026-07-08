import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminConversations } from "@/lib/admin/chats";

export async function GET(request: NextRequest) {
  try {
    await requireAuth("admin");
    const storeId = request.nextUrl.searchParams.get("storeId");

    if (!storeId) {
      return NextResponse.json(
        { error: "storeId is required" },
        { status: 400 }
      );
    }

    const conversations = await getAdminConversations(storeId);
    return NextResponse.json({ conversations });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
