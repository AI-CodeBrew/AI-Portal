import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/currency";

export type StoreReturnPolicy = {
  return_policy_days: number;
  return_replacement_enabled: boolean;
  return_refund_enabled: boolean;
  return_policy_notes: string | null;
};

export type OrderSupportDetails = {
  found: true;
  order_id?: string;
  order_number: string | null;
  status: string;
  source: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  items: Array<{ title: string; quantity: number; price?: number }>;
  total: number | null;
  currency: string | null;
  total_formatted: string | null;
  tracking_number: string | null;
  tracking_company: string | null;
  created_at: string | null;
  days_since_order: number | null;
  is_replacement: boolean;
  refund_status: string;
  shipping_address: Record<string, unknown> | null;
};

export type ReturnPolicyCheck = {
  eligible: boolean;
  order_id: string | null;
  order_number: string | null;
  policy_days: number;
  days_since_order: number | null;
  replacement_allowed: boolean;
  refund_allowed: boolean;
  refund_amount_if_approved: number | null;
  refund_amount_formatted: string | null;
  currency: string | null;
  allowed_actions: Array<"replacement" | "refund" | "escalate">;
  reasons: string[];
  policy_notes: string | null;
  message: string;
};

const DEFAULT_POLICY: StoreReturnPolicy = {
  return_policy_days: 7,
  return_replacement_enabled: true,
  return_refund_enabled: true,
  return_policy_notes: null,
};

function normalizeOrderNumber(value: string): string {
  return value.trim().replace(/^#/, "");
}

function formatOrderItems(
  items: unknown
): Array<{ title: string; quantity: number; price?: number }> {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const i = raw as {
      title?: string;
      name?: string;
      quantity?: number;
      price?: number;
    };
    return {
      title: i.title || i.name || "item",
      quantity: Math.max(1, Number(i.quantity) || 1),
      price: i.price != null ? Number(i.price) : undefined,
    };
  });
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function phonesMatch(a: string, b: string): boolean {
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  if (!da || !db) return false;
  return (
    da === db ||
    da.endsWith(db.slice(-10)) ||
    db.endsWith(da.slice(-10))
  );
}

export async function getStoreReturnPolicy(
  storeId: string
): Promise<StoreReturnPolicy> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("stores")
    .select(
      "return_policy_days, return_replacement_enabled, return_refund_enabled, return_policy_notes"
    )
    .eq("id", storeId)
    .maybeSingle();

  if (!data) return DEFAULT_POLICY;

  return {
    return_policy_days:
      Number(data.return_policy_days) > 0
        ? Number(data.return_policy_days)
        : DEFAULT_POLICY.return_policy_days,
    return_replacement_enabled:
      data.return_replacement_enabled ?? DEFAULT_POLICY.return_replacement_enabled,
    return_refund_enabled:
      data.return_refund_enabled ?? DEFAULT_POLICY.return_refund_enabled,
    return_policy_notes: (data.return_policy_notes as string | null) ?? null,
  };
}

async function findStoreOrderByNumber(
  storeId: string,
  orderNumber: string
): Promise<Record<string, unknown> | null> {
  const supabase = createAdminClient();
  const raw = normalizeOrderNumber(orderNumber);
  const candidates = Array.from(
    new Set([orderNumber.trim(), raw, `#${raw}`, `Order ${raw}`])
  );

  for (const candidate of candidates) {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("store_id", storeId)
      .eq("order_number", candidate)
      .maybeSingle();
    if (data) return data as Record<string, unknown>;
  }

  const { data: rows } = await supabase
    .from("orders")
    .select("*")
    .eq("store_id", storeId)
    .ilike("order_number", `%${raw}%`)
    .order("created_at", { ascending: false })
    .limit(5);

  const match = (rows ?? []).find((r) => {
    const n = normalizeOrderNumber(String(r.order_number ?? ""));
    return n === raw || n.endsWith(raw);
  });
  return (match as Record<string, unknown> | undefined) ?? null;
}

function mapOrderToSupportDetails(
  order: Record<string, unknown>
): OrderSupportDetails {
  const currency = (order.currency as string | null) ?? null;
  const total = order.total != null ? Number(order.total) : null;
  const shipping = (order.shipping_address as Record<string, unknown> | null) ?? null;
  const createdAt = String(order.created_at ?? "") || null;

  return {
    found: true as const,
    order_id: String(order.id ?? ""),
    order_number: (order.order_number as string | null) ?? null,
    status: String(order.status ?? "unknown"),
    source: (order.source as string | null) ?? null,
    customer_name:
      (shipping?.name as string | undefined)?.trim() ||
      (shipping?.customer_name as string | undefined)?.trim() ||
      null,
    customer_phone: (shipping?.phone as string | undefined)?.trim() || null,
    items: formatOrderItems(order.items),
    total,
    currency,
    total_formatted:
      currency != null && total != null ? formatMoney(total, currency) : null,
    tracking_number: (order.tracking_number as string | null) ?? null,
    tracking_company: (order.tracking_company as string | null) ?? null,
    created_at: createdAt,
    days_since_order: daysSince(createdAt),
    is_replacement: Boolean(order.is_replacement),
    refund_status: String(order.refund_status ?? "none"),
    shipping_address: shipping,
  };
}

export async function getOrderDetailsForSupport(
  storeId: string,
  options: {
    orderNumber?: string;
    customerPhone?: string;
  }
): Promise<OrderSupportDetails | { found: false; message: string }> {
  const orderNumber = String(options.orderNumber ?? "").trim();

  if (orderNumber) {
    const order = await findStoreOrderByNumber(storeId, orderNumber);
    if (!order) {
      return {
        found: false,
        message: `Order ${orderNumber} was not found in this store.`,
      };
    }
    return mapOrderToSupportDetails(order);
  }

  const phone = String(options.customerPhone ?? "").replace(/\D/g, "");
  if (!phone) {
    return {
      found: false,
      message: "Provide an order number or customer phone to look up the order.",
    };
  }

  const supabase = createAdminClient();
  const { data: recent } = await supabase
    .from("orders")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(40);

  const match = (recent ?? []).find((row) => {
    const shipping = row.shipping_address as { phone?: string } | null;
    const addrPhone = String(shipping?.phone ?? "").replace(/\D/g, "");
    return addrPhone && phonesMatch(addrPhone, phone);
  });

  if (!match) {
    return {
      found: false,
      message: "No order found for this phone. Ask for the order number or name on the order.",
    };
  }

  return mapOrderToSupportDetails(match as Record<string, unknown>);
}

export async function checkReturnPolicyForOrder(
  storeId: string,
  options: {
    orderNumber: string;
    customerPhone?: string;
  }
): Promise<ReturnPolicyCheck> {
  const policy = await getStoreReturnPolicy(storeId);
  const orderNumber = String(options.orderNumber ?? "").trim();
  const order = await findStoreOrderByNumber(storeId, orderNumber);

  if (!order) {
    return {
      eligible: false,
      order_id: null,
      order_number: orderNumber || null,
      policy_days: policy.return_policy_days,
      days_since_order: null,
      replacement_allowed: false,
      refund_allowed: false,
      refund_amount_if_approved: null,
      refund_amount_formatted: null,
      currency: null,
      allowed_actions: ["escalate"],
      reasons: ["Order not found — verify order number with the customer."],
      policy_notes: policy.return_policy_notes,
      message: "Order not found. Ask the customer to confirm the order number, then escalate_to_human if still unclear.",
    };
  }

  const details = mapOrderToSupportDetails(order);
  const reasons: string[] = [];
  const allowed: Array<"replacement" | "refund" | "escalate"> = [];
  const status = details.status.toLowerCase();
  const refundStatus = details.refund_status;
  const days = details.days_since_order;
  const currency = details.currency;
  const total = details.total;

  if (options.customerPhone && details.customer_phone) {
    if (!phonesMatch(details.customer_phone, options.customerPhone)) {
      reasons.push(
        "Order phone does not match this WhatsApp chat — verify identity before resolving."
      );
    }
  }

  if (status === "cancelled") {
    reasons.push("Order is cancelled.");
  }
  if (refundStatus === "processed" || refundStatus === "approved") {
    reasons.push("A refund has already been initiated or processed for this order.");
  }
  if (details.is_replacement) {
    reasons.push("This order is already a replacement shipment.");
  }
  if (days != null && days > policy.return_policy_days) {
    reasons.push(
      `Order is ${days} days old — outside the ${policy.return_policy_days}-day return window.`
    );
  }

  const eligible =
    reasons.length === 0 &&
    (status === "confirmed" ||
      status === "pending" ||
      status === "shipped" ||
      status.includes("fulfill"));

  if (eligible && policy.return_replacement_enabled) {
    allowed.push("replacement");
  }
  if (eligible && policy.return_refund_enabled) {
    allowed.push("refund");
  }
  if (!eligible || allowed.length === 0) {
    allowed.push("escalate");
  }

  const refundAmount =
    eligible && total != null && total > 0 ? total : null;

  return {
    eligible,
    order_id: details.order_id ?? null,
    order_number: details.order_number,
    policy_days: policy.return_policy_days,
    days_since_order: days,
    replacement_allowed: eligible && policy.return_replacement_enabled,
    refund_allowed: eligible && policy.return_refund_enabled,
    refund_amount_if_approved: refundAmount,
    refund_amount_formatted:
      refundAmount != null && currency
        ? formatMoney(refundAmount, currency)
        : null,
    currency,
    allowed_actions: Array.from(new Set(allowed)),
    reasons,
    policy_notes: policy.return_policy_notes,
    message: eligible
      ? `Eligible under ${policy.return_policy_days}-day policy. Allowed: ${allowed.join(", ")}. Use refund_amount_if_approved exactly — never invent amounts.`
      : `Not eligible for automatic resolution (${reasons.join("; ") || "see reasons"}). Use escalate_to_human.`,
  };
}

export async function recordOrderComplaint(
  storeId: string,
  orderId: string,
  input: {
    complaint_type?: string;
    description?: string;
  }
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("orders")
    .update({
      complaint_type: input.complaint_type?.slice(0, 64) ?? null,
      complaint_description: input.description?.slice(0, 2000) ?? null,
    })
    .eq("id", orderId)
    .eq("store_id", storeId);
}

export async function initiateOrderRefund(
  storeId: string,
  options: {
    orderNumber: string;
    customerPhone?: string;
    reason?: string;
    issue_type?: string;
  }
): Promise<{
  success: boolean;
  error?: string;
  order_number?: string;
  refund_amount?: number;
  refund_amount_formatted?: string;
  currency?: string;
  refund_status?: string;
  requires_human?: boolean;
  message: string;
}> {
  const policyCheck = await checkReturnPolicyForOrder(storeId, {
    orderNumber: options.orderNumber,
    customerPhone: options.customerPhone,
  });

  if (!policyCheck.order_id) {
    return {
      success: false,
      error: "Order not found",
      message: policyCheck.message,
    };
  }

  if (!policyCheck.eligible || !policyCheck.refund_allowed) {
    return {
      success: false,
      error: "Refund not allowed under store policy",
      requires_human: true,
      message: policyCheck.message,
    };
  }

  const refundAmount = policyCheck.refund_amount_if_approved;
  if (refundAmount == null || refundAmount <= 0) {
    return {
      success: false,
      error: "Could not determine refund amount from order record",
      requires_human: true,
      message: "Escalate to human — refund amount could not be read from the order.",
    };
  }

  const supabase = createAdminClient();
  await recordOrderComplaint(storeId, policyCheck.order_id, {
    complaint_type: options.issue_type ?? "refund",
    description: options.reason,
  });

  const { error } = await supabase
    .from("orders")
    .update({
      refund_status: "approved",
      refund_amount: refundAmount,
    })
    .eq("id", policyCheck.order_id)
    .eq("store_id", storeId);

  if (error) {
    return {
      success: false,
      error: error.message,
      message: `Could not record refund: ${error.message}. Escalate to human.`,
    };
  }

  return {
    success: true,
    order_number: policyCheck.order_number ?? undefined,
    refund_amount: refundAmount,
    refund_amount_formatted: policyCheck.refund_amount_formatted ?? undefined,
    currency: policyCheck.currency ?? undefined,
    refund_status: "approved",
    requires_human: true,
    message: `Refund approved for ${policyCheck.refund_amount_formatted} (from order total). Payment team will process it — tell the customer they'll receive confirmation soon. Do not promise a different amount.`,
  };
}
