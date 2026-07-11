import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { sendOrderFollowUp } from "@/lib/orders/follow-up";
import { listWhatsAppTemplates } from "@/lib/whatsapp/message-templates";
import { createAdminClient } from "@/lib/supabase/admin";

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

export async function POST(request: NextRequest) {
  try {
    const { user, storeId } = await requireResellerStore();
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

    const orderIds = body.orderIds.slice(0, 50);
    const supabase = createAdminClient();

    const { data: template } = await supabase
      .from("whatsapp_message_templates")
      .select("id, store_id, status")
      .eq("id", body.templateId)
      .eq("store_id", storeId)
      .maybeSingle();

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    if (template.status !== "approved") {
      return NextResponse.json(
        { error: "Only Meta-approved templates can be used" },
        { status: 400 }
      );
    }

    // Ensure all orders belong to this store
    const { data: owned } = await supabase
      .from("orders")
      .select("id")
      .eq("store_id", storeId)
      .in("id", orderIds);

    const ownedIds = new Set((owned ?? []).map((o) => o.id as string));
    const results: Array<{
      orderId: string;
      ok: boolean;
      templateName?: string;
      to?: string;
      error?: string;
    }> = [];

    for (const orderId of orderIds) {
      if (!ownedIds.has(orderId)) {
        results.push({ orderId, ok: false, error: "Order not found" });
        continue;
      }
      const result = await sendOrderFollowUp(orderId, user, body.templateId);
      if ("error" in result) {
        results.push({ orderId, ok: false, error: result.error });
      } else {
        results.push({
          orderId,
          ok: true,
          templateName: result.templateName,
          to: result.to,
        });
      }
    }

    return NextResponse.json({
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
