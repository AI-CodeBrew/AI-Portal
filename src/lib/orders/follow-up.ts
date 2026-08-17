import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStoreWhatsAppCredentials,
  sendWhatsAppTemplate,
  formatOrderConfirmationParams,
} from "@/lib/whatsapp";
import type { AuthUser } from "@/lib/auth";
import {
  findOrderConversationId,
  resolveOrderWhatsAppTargets,
} from "@/lib/orders/order-whatsapp-phone";
import { DEFAULT_STORE_CURRENCY } from "@/lib/currency";

export async function sendOrderFollowUp(
  orderId: string,
  user: AuthUser,
  templateId: string
): Promise<
  | { ok: true; templateName: string; to: string; orderId: string }
  | { error: string; status: number; orderId: string }
> {
  const supabase = createAdminClient();
  const isAdmin = user.role === "admin";

  if (!isAdmin && !user.storeId) {
    return { error: "No store linked", status: 400, orderId };
  }

  let orderQuery = supabase
    .from("orders")
    .select("*, customers(phone, name)")
    .eq("id", orderId);

  if (!isAdmin && user.storeId) {
    orderQuery = orderQuery.eq("store_id", user.storeId);
  }

  const { data: order } = await orderQuery.maybeSingle();

  if (!order) {
    return { error: "Order not found", status: 404, orderId };
  }

  const storeId = order.store_id as string;

  const { data: template } = await supabase
    .from("whatsapp_message_templates")
    .select("id, name, language, status, body_text")
    .eq("id", templateId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!template) {
    return { error: "Template not found", status: 404, orderId };
  }
  if (template.status !== "approved") {
    return {
      error: "Only Meta-approved templates can be used for follow-up",
      status: 400,
      orderId,
    };
  }

  const { data: store } = await supabase
    .from("stores")
    .select(
      "id, whatsapp_phone_number_id, whatsapp_access_token, store_name, shop_domain, shopify_access_token"
    )
    .eq("id", storeId)
    .single();

  if (!store) {
    return { error: "Store not found", status: 404, orderId };
  }

  const waCreds = getStoreWhatsAppCredentials({
    whatsapp_phone_number_id: store.whatsapp_phone_number_id,
    whatsapp_access_token: store.whatsapp_access_token,
  });
  if (!waCreds) {
    return { error: "WhatsApp is not connected", status: 400, orderId };
  }

  const resolved = await resolveOrderWhatsAppTargets(supabase, order, store);
  if ("error" in resolved) {
    return { error: resolved.error, status: 400, orderId };
  }

  const { targets, customerName } = resolved;

  const items = (order.items as Array<{ title: string; quantity: number }>) ?? [];
  const bodyParams = buildFollowUpParams({
    bodyText: template.body_text as string,
    customerName,
    orderNumber: (order.order_number as string | null) ?? orderId.slice(0, 8),
    items,
    total: Number(order.total ?? 0),
    currency: (order.currency as string | null) ?? null,
  });

  let to = targets[0]!;
  let lastError = "WhatsApp template send failed";

  for (const candidate of targets) {
    try {
      await sendWhatsAppTemplate({
        phoneNumberId: waCreds.phoneNumberId,
        accessToken: waCreds.accessToken,
        to: candidate,
        templateName: template.name as string,
        languageCode: (template.language as string) || "en",
        bodyParams,
      });
      to = candidate;
      lastError = "";
      break;
    } catch (err) {
      lastError =
        err instanceof Error ? err.message : "WhatsApp template send failed";
      console.warn(
        `[follow-up] template send failed order=${orderId} to=${candidate}: ${lastError}`
      );
    }
  }

  if (lastError) {
    const tried = targets.map((t) => `+${t}`).join(", ");
    return {
      error: `${lastError} (tried: ${tried})`,
      status: 502,
      orderId,
    };
  }

  const conversationId = await findOrderConversationId(
    supabase,
    storeId,
    order.customer_id as string | null,
    to,
    targets
  );

  if (conversationId) {
    const preview = `Follow-up template: ${template.name}`;
    await supabase.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      direction: "out",
      content: preview,
    });
    await supabase
      .from("whatsapp_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
  }

  return {
    ok: true,
    templateName: template.name as string,
    to,
    orderId,
  };
}

function countBodyVariables(bodyText: string): number {
  const matches = bodyText.match(/\{\{(\d+)\}\}/g) ?? [];
  let max = 0;
  for (const m of matches) {
    const n = Number(m.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return max;
}

function buildFollowUpParams(input: {
  bodyText: string;
  customerName: string | null;
  orderNumber: string;
  items: Array<{ title: string; quantity: number }>;
  total: number;
  currency: string | null;
}): string[] {
  const varCount = countBodyVariables(input.bodyText);
  if (varCount === 0) return [];

  const defaults = formatOrderConfirmationParams(
    input.orderNumber,
    input.items,
    input.total,
    input.currency
  );
  const pool = [
    input.customerName || "there",
    defaults[1]?.trim() || defaults[0],
    defaults[2] ?? String(input.total),
    defaults[0],
    input.currency ?? DEFAULT_STORE_CURRENCY,
  ];

  const params: string[] = [];
  for (let i = 0; i < varCount; i++) {
    const value = (pool[i] ?? pool[pool.length - 1] ?? "").trim();
    params.push(value || "N/A");
  }
  return params;
}
