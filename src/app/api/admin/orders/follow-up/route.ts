import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendOrderFollowUp } from "@/lib/orders/follow-up";
import { listWhatsAppTemplates } from "@/lib/whatsapp/message-templates";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const templates = await listWhatsAppTemplates(storeId);
    const approved = templates.filter((t) => t.status === "approved");
    return NextResponse.json({ templates: approved });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth("admin");
    const body = (await request.json()) as {
      orderIds?: string[];
      templateId?: string;
    };

    if (!Array.isArray(body.orderIds) || body.orderIds.length === 0) {
      return NextResponse.json(
        { error: "orderIds must be a non-empty array" },
        { status: 400 }
      );
    }
    if (!body.templateId) {
      return NextResponse.json(
        { error: "templateId is required" },
        { status: 400 }
      );
    }

    // Cap bulk size
    const orderIds = body.orderIds.slice(0, 50);
    const results: Array<{
      orderId: string;
      ok: boolean;
      templateName?: string;
      to?: string;
      error?: string;
    }> = [];

    // Ensure template exists (any store) before looping
    const supabase = createAdminClient();
    const { data: template } = await supabase
      .from("whatsapp_message_templates")
      .select("id, store_id, status")
      .eq("id", body.templateId)
      .maybeSingle();

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }
    if (template.status !== "approved") {
      return NextResponse.json(
        { error: "Only Meta-approved templates can be used" },
        { status: 400 }
      );
    }

    for (const orderId of orderIds) {
      const result = await sendOrderFollowUp(orderId, user, body.templateId);
      if ("error" in result) {
        results.push({
          orderId,
          ok: false,
          error: result.error,
        });
      } else {
        results.push({
          orderId,
          ok: true,
          templateName: result.templateName,
          to: result.to,
        });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return NextResponse.json({ sent, failed, results });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
