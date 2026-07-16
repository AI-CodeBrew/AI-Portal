import { NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { listWhatsAppTemplates } from "@/lib/whatsapp/message-templates";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const templates = await listWhatsAppTemplates(storeId);
    const approved = templates.filter((t) => t.status === "approved");
    return NextResponse.json({ templates: approved });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
