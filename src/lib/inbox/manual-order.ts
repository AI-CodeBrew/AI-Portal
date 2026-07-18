import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/currency";
import {
  findProductRefFromHistory,
  validateCheckoutMessage,
  type CheckoutValidationIssue,
} from "@/lib/ai/checkout-parse";
import {
  getPendingRecoveryOffer,
  parseOrderQuantity,
} from "@/lib/ai/sales-recovery";
import { resolveStoreAiConfig } from "@/lib/ai/store-ai-settings";
import {
  getStoreProduct,
  getPrimaryProductImageUrl,
} from "@/lib/products/products-service";
import {
  createWhatsAppAiOrder,
  resolveOrderLineFromChatRef,
} from "@/lib/orders/whatsapp-create";
import {
  formatOrderConfirmationMessage,
} from "@/lib/orders/notify";
import { sendWhatsAppOutboundMessage } from "@/lib/inbox/send-whatsapp-outbound";
import type { WindowType } from "@/lib/whatsapp-window/window-status";
import type { Store } from "@/lib/types";

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function loadConversationChatHistory(
  conversationId: string
): Promise<ChatHistoryMessage[]> {
  const supabase = createAdminClient();
  const { data: messages } = await supabase
    .from("whatsapp_messages")
    .select("direction, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  return (messages ?? []).map((m) => ({
    role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
    content: String(m.content ?? ""),
  }));
}

function findCheckoutFromHistory(
  history: ChatHistoryMessage[],
  hintPhone?: string | null
) {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== "user") continue;
    const validation = validateCheckoutMessage(msg.content, hintPhone);
    if (validation.ok) {
      return {
        details: validation.details,
        sourceMessage: msg.content,
      };
    }
  }
  return null;
}

function latestUserMessage(history: ChatHistoryMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "user") return history[i]!.content;
  }
  return "";
}

export type ManualOrderPreview = {
  ready: boolean;
  missing: Array<"phone" | "address" | "product">;
  issues: CheckoutValidationIssue[];
  product: {
    title: string;
    sku: string | null;
    variantId: string | null;
    productId: string | null;
    priceFormatted: string | null;
    imageUrl: string | null;
  } | null;
  shipping: {
    customerName: string;
    phone: string;
    address1: string;
    city: string;
  } | null;
  quantity: number;
  discountPercent: number | null;
};

export async function buildManualOrderPreview(params: {
  storeId: string;
  customerPhone: string;
  history: ChatHistoryMessage[];
}): Promise<ManualOrderPreview> {
  const aiConfig = await resolveStoreAiConfig(params.storeId);
  const pendingOffer = getPendingRecoveryOffer(params.history, {
    discount: aiConfig.effectiveRecoveryDiscountPercent ?? undefined,
    bundle: aiConfig.effectiveRecoveryBundleDiscountPercent ?? undefined,
  });

  const checkout = findCheckoutFromHistory(params.history, params.customerPhone);
  const latestCheckoutText = checkout?.sourceMessage ?? latestUserMessage(params.history);
  const quantity = parseOrderQuantity(
    latestCheckoutText,
    pendingOffer?.defaultQty ?? 1
  );

  const missing: ManualOrderPreview["missing"] = [];
  const issues: CheckoutValidationIssue[] = [];

  let shipping: ManualOrderPreview["shipping"] = checkout
    ? {
        customerName: checkout.details.customer_name,
        phone: checkout.details.phone,
        address1: checkout.details.address1,
        city: checkout.details.city,
      }
    : null;
  if (!shipping) {
    missing.push("phone", "address");
    const probe = validateCheckoutMessage(latestCheckoutText, params.customerPhone);
    if (!probe.ok) issues.push(...probe.issues);
  }

  const productRef = findProductRefFromHistory(params.history);
  if (!productRef) {
    missing.push("product");
    return {
      ready: false,
      missing,
      issues,
      product: null,
      shipping,
      quantity,
      discountPercent:
        pendingOffer?.percent && pendingOffer.percent > 0
          ? pendingOffer.percent
          : null,
    };
  }

  const resolvedLine = await resolveOrderLineFromChatRef(params.storeId, productRef);
  if (!resolvedLine) {
    missing.push("product");
    return {
      ready: false,
      missing,
      issues,
      product: null,
      shipping,
      quantity,
      discountPercent:
        pendingOffer?.percent && pendingOffer.percent > 0
          ? pendingOffer.percent
          : null,
    };
  }

  let title = productRef.sku ?? "Product";
  let sku: string | null = productRef.sku ?? resolvedLine.sku ?? null;
  let priceFormatted: string | null = null;
  let imageUrl: string | null = null;
  const productId = resolvedLine.product_id ?? null;
  const variantId = resolvedLine.variant_id ?? productRef.variant_id ?? null;

  if (productId) {
    const product = await getStoreProduct(params.storeId, productId);
    if (product) {
      title = product.name;
      sku = product.sku;
      imageUrl = getPrimaryProductImageUrl(product);
      const variant = product.variants?.find((v) => v.id === variantId);
      const price = variant?.price ?? product.price;
      priceFormatted = formatMoney(Number(price), product.currency);
    }
  }

  const ready = Boolean(shipping && resolvedLine);
  if (!shipping) {
    // already flagged phone/address
  }

  return {
    ready,
    missing,
    issues,
    product: {
      title,
      sku,
      variantId,
      productId,
      priceFormatted,
      imageUrl,
    },
    shipping,
    quantity,
    discountPercent:
      pendingOffer?.percent && pendingOffer.percent > 0
        ? pendingOffer.percent
        : null,
  };
}

export async function placeManualInboxOrder(params: {
  store: Store;
  conversationId: string;
  customerPhone: string;
  customerId: string | null;
  lastCustomerMessageAt: string | null;
  windowType: WindowType | null;
  history: ChatHistoryMessage[];
  overrides?: {
    customerName?: string;
    phone?: string;
    address1?: string;
    city?: string;
    quantity?: number;
    variantId?: string;
    productId?: string;
    sku?: string;
    discountPercent?: number | null;
  };
}): Promise<
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      totalFormatted: string;
      confirmationText: string;
      whatsappSent: boolean;
      whatsappError?: string;
    }
  | { ok: false; error: string }
> {
  const preview = await buildManualOrderPreview({
    storeId: params.store.id,
    customerPhone: params.customerPhone,
    history: params.history,
  });

  const phone = params.overrides?.phone?.trim() || preview.shipping?.phone;
  const address1 =
    params.overrides?.address1?.trim() || preview.shipping?.address1;
  const city = params.overrides?.city?.trim() || preview.shipping?.city || "N/A";
  const customerName =
    params.overrides?.customerName?.trim() ||
    preview.shipping?.customerName ||
    "Customer";
  const quantity = params.overrides?.quantity ?? preview.quantity ?? 1;

  if (!phone) {
    return { ok: false, error: "Customer phone is required to place the order." };
  }
  if (!address1) {
    return {
      ok: false,
      error: "Delivery address is required to place the order.",
    };
  }

  const productRef =
    params.overrides?.variantId || params.overrides?.productId || params.overrides?.sku
      ? {
          variant_id: params.overrides.variantId,
          product_id: params.overrides.productId,
          sku: params.overrides.sku,
          source: "portal" as const,
        }
      : findProductRefFromHistory(params.history);

  if (!productRef) {
    return {
      ok: false,
      error: "No product found in this chat. Send a product card first.",
    };
  }

  const resolvedLine = await resolveOrderLineFromChatRef(params.store.id, {
    ...productRef,
    ...(params.overrides?.variantId
      ? { variant_id: params.overrides.variantId }
      : {}),
    ...(params.overrides?.productId
      ? { product_id: params.overrides.productId }
      : {}),
    ...(params.overrides?.sku ? { sku: params.overrides.sku } : {}),
  });

  if (!resolvedLine) {
    return {
      ok: false,
      error: "Could not match the product in your catalog.",
    };
  }

  const aiConfig = await resolveStoreAiConfig(params.store.id);
  const pendingOffer = getPendingRecoveryOffer(params.history, {
    discount: aiConfig.effectiveRecoveryDiscountPercent ?? undefined,
    bundle: aiConfig.effectiveRecoveryBundleDiscountPercent ?? undefined,
  });

  const discountPercent =
    params.overrides?.discountPercent ??
    preview.discountPercent ??
    (pendingOffer?.percent && pendingOffer.percent > 0
      ? pendingOffer.percent
      : undefined);

  const created = await createWhatsAppAiOrder({
    store: params.store,
    conversationCustomerId: params.customerId,
    conversationPhone: params.customerPhone,
    lineItems: [
      {
        ...resolvedLine,
        quantity,
      },
    ],
    shipping: {
      customer_name: customerName,
      phone,
      address1,
      city,
    },
    discountPercent: discountPercent ?? undefined,
    recoveryDealType: pendingOffer?.type ?? undefined,
  });

  if (!created.ok) {
    return { ok: false, error: created.error };
  }

  const itemTitle = preview.product?.title ?? "Order item";
  const customerWhatsappText = formatOrderConfirmationMessage(
    created.order_number,
    [{ title: itemTitle, quantity }],
    created.total,
    created.currency,
    customerName
  );

  const confirmationText = [
    `✅ Order *${created.order_number}* confirmed`,
    quantity > 1 ? `Qty: ${quantity}` : null,
    discountPercent ? `${discountPercent}% off applied` : null,
    created.total_formatted ? `Total: ${created.total_formatted}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const supabase = createAdminClient();
  let whatsappSent = Boolean(created.whatsapp_sent);
  let whatsappError = created.whatsapp_error;

  if (!whatsappSent) {
    const sendResult = await sendWhatsAppOutboundMessage({
      conversationId: params.conversationId,
      customerPhone: params.customerPhone,
      store: params.store,
      content: customerWhatsappText,
      lastCustomerMessageAt: params.lastCustomerMessageAt,
      windowType: params.windowType,
    });
    whatsappSent = sendResult.ok;
    whatsappError = sendResult.ok ? undefined : sendResult.error;
  } else {
    await supabase.from("whatsapp_messages").insert({
      conversation_id: params.conversationId,
      direction: "out",
      content: confirmationText,
    });
  }

  if (params.customerId && created.order_id) {
    await supabase
      .from("whatsapp_conversations")
      .update({
        customer_id: params.customerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.conversationId);
  } else {
    await supabase
      .from("whatsapp_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", params.conversationId);
  }

  return {
    ok: true,
    orderId: created.order_id,
    orderNumber: created.order_number,
    totalFormatted: created.total_formatted,
    confirmationText: whatsappSent ? customerWhatsappText : confirmationText,
    whatsappSent,
    whatsappError,
  };
}
