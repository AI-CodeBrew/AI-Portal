import { NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { listInboxContacts } from "@/lib/broadcasts";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const contacts = await listInboxContacts(storeId);
    return NextResponse.json({ contacts });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
