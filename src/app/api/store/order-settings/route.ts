import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { listWhatsAppTemplates } from "@/lib/whatsapp/message-templates";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("stores")
      .select(
        "auto_confirm_orders, auto_follow_up_template_id, whatsapp_order_template_id"
      )
      .eq("id", storeId)
      .single();

    const templates = await listWhatsAppTemplates(storeId);
    const approved = templates.filter((t) => t.status === "approved");

    return NextResponse.json({
      autoConfirmOrders: Boolean(data?.auto_confirm_orders),
      autoFollowUpTemplateId:
        (data?.auto_follow_up_template_id as string | null) ?? null,
      whatsappOrderTemplateId:
        (data?.whatsapp_order_template_id as string | null) ?? null,
      approvedTemplates: approved,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      autoConfirmOrders?: boolean;
      autoFollowUpTemplateId?: string | null;
    };

    const supabase = createAdminClient();
    const payload: Record<string, unknown> = {};

    if (body.autoConfirmOrders !== undefined) {
      payload.auto_confirm_orders = Boolean(body.autoConfirmOrders);
    }
    if (body.autoFollowUpTemplateId !== undefined) {
      payload.auto_follow_up_template_id =
        body.autoFollowUpTemplateId || null;
    }

    const { error } = await supabase
      .from("stores")
      .update(payload)
      .eq("id", storeId);

    if (error) {
      const hint = error.message.includes("auto_confirm_orders")
        ? " — Run migration 020_auto_confirm_and_dual_ai.sql in Supabase"
        : "";
      return NextResponse.json(
        { error: error.message + hint },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
