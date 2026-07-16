import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStoreWhatsAppCredentials,
  normalizePhone,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp";
import {
  buildTemplateBodyParams,
  type TemplateContext,
} from "@/lib/whatsapp-window/template-params";

function authErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : "";
  if (message === "UNAUTHORIZED" || message === "FORBIDDEN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (message === "NO_STORE") {
    return NextResponse.json(
      { error: "No store linked to this account" },
      { status: 400 }
    );
  }
  return null;
}

async function loadTemplateContext(
  supabase: ReturnType<typeof createAdminClient>,
  storeId: string,
  conversation: {
    customer_id: string | null;
    customer_phone: string;
  }
): Promise<TemplateContext> {
  let customerName: string | null = null;
  if (conversation.customer_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("name")
      .eq("id", conversation.customer_id)
      .maybeSingle();
    customerName = (customer?.name as string | null)?.trim() || null;
  }

  if (!customerName) {
    const phone = normalizePhone(conversation.customer_phone);
    const { data: customer } = await supabase
      .from("customers")
      .select("name")
      .eq("store_id", storeId)
      .eq("phone", phone)
      .maybeSingle();
    customerName = (customer?.name as string | null)?.trim() || null;
  }

  let orderNumber: string | null = null;
  let items: Array<{ title: string; quantity: number }> = [];
  let total: number | null = null;
  let currency: string | null = null;
  let sku: string | null = null;

  if (conversation.customer_id) {
    const { data: order } = await supabase
      .from("orders")
      .select("order_number, items, total, currency")
      .eq("store_id", storeId)
      .eq("customer_id", conversation.customer_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (order) {
      orderNumber = (order.order_number as string | null) ?? null;
      items = (order.items as Array<{ title: string; quantity: number }>) ?? [];
      total = Number(order.total ?? 0);
      currency = (order.currency as string | null) ?? null;
      const firstItem = items[0];
      if (firstItem && "sku" in firstItem) {
        sku = String((firstItem as { sku?: string }).sku ?? "") || null;
      }
    }
  }

  return {
    customerName,
    orderNumber,
    items,
    total,
    currency,
    sku,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      conversationId?: string;
      templateId?: string;
      newStatus?: "ai_handling" | "closed";
    };

    const conversationId = body.conversationId?.trim();
    const templateId = body.templateId?.trim();

    if (!conversationId || !templateId) {
      return NextResponse.json(
        { error: "conversationId and templateId are required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: conversation, error: convError } = await supabase
      .from("whatsapp_conversations")
      .select(
        "id, customer_id, customer_phone, store_id, marketing_opt_in, stores(whatsapp_phone_number_id, whatsapp_access_token)"
      )
      .eq("id", conversationId)
      .eq("store_id", storeId)
      .maybeSingle();

    if (convError) {
      return NextResponse.json({ error: convError.message }, { status: 500 });
    }

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const { data: template } = await supabase
      .from("whatsapp_message_templates")
      .select("id, name, language, status, category, body_text")
      .eq("id", templateId)
      .eq("store_id", storeId)
      .maybeSingle();

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (template.status !== "approved") {
      return NextResponse.json(
        { error: "Only Meta-approved templates can be sent" },
        { status: 400 }
      );
    }

    if (
      template.category === "MARKETING" &&
      !conversation.marketing_opt_in
    ) {
      return NextResponse.json(
        {
          error:
            "Marketing templates require recorded customer opt-in. Use a Utility template or record consent first.",
          marketingConsentRequired: true,
        },
        { status: 400 }
      );
    }

    const storeRaw = conversation.stores as
      | {
          whatsapp_phone_number_id: string | null;
          whatsapp_access_token: string | null;
        }
      | {
          whatsapp_phone_number_id: string | null;
          whatsapp_access_token: string | null;
        }[]
      | null;

    const store = Array.isArray(storeRaw) ? storeRaw[0] : storeRaw;

    if (!store) {
      return NextResponse.json(
        { error: "Store not found for this conversation" },
        { status: 400 }
      );
    }

    const waCreds = getStoreWhatsAppCredentials(store);
    if (!waCreds) {
      return NextResponse.json(
        {
          error:
            "WhatsApp is not connected or the access token could not be decrypted. Reconnect WhatsApp in Integrations.",
        },
        { status: 400 }
      );
    }

    const to = normalizePhone(conversation.customer_phone);
    if (!to || to.length < 8) {
      return NextResponse.json(
        { error: `Invalid customer phone number: ${conversation.customer_phone}` },
        { status: 400 }
      );
    }

    const context = await loadTemplateContext(supabase, storeId, {
      customer_id: conversation.customer_id as string | null,
      customer_phone: conversation.customer_phone as string,
    });

    const bodyParams = buildTemplateBodyParams(
      template.body_text as string,
      context
    );

    try {
      await sendWhatsAppTemplate({
        phoneNumberId: waCreds.phoneNumberId,
        accessToken: waCreds.accessToken,
        to,
        templateName: template.name as string,
        languageCode: (template.language as string) || "en",
        bodyParams,
      });
    } catch (sendErr) {
      const detail =
        sendErr instanceof Error ? sendErr.message : "WhatsApp template send failed";
      console.error("[messages/send-template] failed:", detail);
      return NextResponse.json(
        { error: `Could not deliver template. Details: ${detail}` },
        { status: 502 }
      );
    }

    const preview = `Template: ${template.name}`;
    const { error: insertError } = await supabase
      .from("whatsapp_messages")
      .insert({
        conversation_id: conversationId,
        direction: "out",
        content: preview,
      });

    if (insertError) {
      return NextResponse.json(
        {
          error:
            "Template was sent on WhatsApp but failed to save in the portal.",
        },
        { status: 500 }
      );
    }

    const conversationUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.newStatus) {
      conversationUpdate.status = body.newStatus;
    }

    await supabase
      .from("whatsapp_conversations")
      .update(conversationUpdate)
      .eq("id", conversationId);

    return NextResponse.json({
      ok: true,
      to,
      templateName: template.name as string,
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("[messages/send-template]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send template" },
      { status: 500 }
    );
  }
}
