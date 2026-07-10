import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { sendOrderFollowUp } from "@/lib/orders/follow-up";
import { listWhatsAppTemplates } from "@/lib/whatsapp/message-templates";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await getAuthUser();
    if (!user?.storeId || user.role !== "reseller") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    void params; // order id unused for listing templates
    const templates = await listWhatsAppTemplates(user.storeId);
    const approved = templates.filter((t) => t.status === "approved");
    return NextResponse.json({ templates: approved });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "reseller") {
      return NextResponse.json(
        { error: "Only resellers can send follow-ups" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = (await request.json()) as { templateId?: string };
    if (!body.templateId) {
      return NextResponse.json(
        { error: "templateId is required" },
        { status: 400 }
      );
    }

    const result = await sendOrderFollowUp(id, user, body.templateId);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
