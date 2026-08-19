import { NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  listApprovedWhatsAppTemplates,
} from "@/lib/whatsapp/message-templates";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const templates = await listApprovedWhatsAppTemplates(storeId);
    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
