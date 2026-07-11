import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStoreWhatsAppCredentials,
  sendWhatsAppTemplate,
  normalizePhone,
  formatOrderConfirmationParams,
} from "@/lib/whatsapp";
import type { AuthUser } from "@/lib/auth";

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
      "id, whatsapp_phone_number_id, whatsapp_access_token, store_name, shop_domain"
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

  const customer = order.customers as
    | { phone: string | null; name: string | null }
    | { phone: string | null; name: string | null }[]
    | null;
  const cust = Array.isArray(customer) ? customer[0] : customer;
  let phone = cust?.phone?.trim() || null;
  const customerName = cust?.name?.trim() || null;

  // Try Shopify contact if no local phone
  if (!phone && order.shopify_order_id && store) {
    // leave as-is; confirm flow has richer Shopify fetch — keep simple here
  }

  if (!phone) {
    return {
      error: "No customer phone on this order — cannot send WhatsApp follow-up",
      status: 400,
      orderId,
    };
  }

  const items = (order.items as Array<{ title: string; quantity: number }>) ?? [];
  const bodyParams = buildFollowUpParams({
    bodyText: template.body_text as string,
    customerName,
    orderNumber: (order.order_number as string | null) ?? orderId.slice(0, 8),
    items,
    total: Number(order.total ?? 0),
    currency: (order.currency as string | null) ?? null,
  });

  try {
    await sendWhatsAppTemplate({
      phoneNumberId: waCreds.phoneNumberId,
      accessToken: waCreds.accessToken,
      to: normalizePhone(phone),
      templateName: template.name as string,
      languageCode: (template.language as string) || "en",
      bodyParams,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "WhatsApp template send failed";
    return { error: message, status: 502, orderId };
  }

  // Log outbound in conversation if one exists
  const to = normalizePhone(phone);
  const { data: conv } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("store_id", storeId)
    .eq("customer_phone", to)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (conv?.id) {
    const preview = `Follow-up template: ${template.name}`;
    await supabase.from("whatsapp_messages").insert({
      conversation_id: conv.id,
      direction: "out",
      content: preview,
    });
    await supabase
      .from("whatsapp_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conv.id);
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
    defaults[1] ?? defaults[0],
    defaults[2] ?? String(input.total),
    defaults[0],
    input.currency ?? "AED",
  ];

  const params: string[] = [];
  for (let i = 0; i < varCount; i++) {
    params.push(pool[i] ?? pool[pool.length - 1] ?? "");
  }
  return params;
}
