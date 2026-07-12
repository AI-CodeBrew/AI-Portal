import { executeSalesTool, type AgentContext } from "./sales-tools";
import {
  getPendingRecoveryOffer,
  parseOrderQuantity,
} from "./sales-recovery";
import {
  findProductRefFromHistory,
  looksLikeCheckoutMessage,
  parseCheckoutDetails,
} from "./checkout-parse";
import { orderDetailsTemplate } from "./order-details-template";

export {
  looksLikeCheckoutMessage,
  parseCheckoutDetails,
} from "./checkout-parse";

function formatOrderSuccess(params: {
  order_number?: string;
  total_formatted?: string;
  whatsapp_sent?: boolean;
  whatsapp_error?: string;
  phone: string;
  customer_name: string;
  quantity: number;
  discountPercent?: number;
}): string {
  return [
    `✅ Order *${params.order_number}* confirmed`,
    params.quantity > 1 ? `Qty: ${params.quantity}` : null,
    params.discountPercent != null ? `${params.discountPercent}% off applied` : null,
    params.total_formatted ? `Total: ${params.total_formatted}` : null,
    params.whatsapp_sent
      ? `Confirmation sent to ${params.phone}`
      : null,
    `Thanks, ${params.customer_name}!`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * When the customer shares name/phone/address to place an order, create + confirm
 * on the portal (with recovery discount/qty when applicable).
 */
export async function tryDirectCheckoutReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string | null> {
  const { discount, bundle } = {
    discount:
      ctx.aiConfig?.effectiveRecoveryDiscountPercent ??
      undefined,
    bundle:
      ctx.aiConfig?.effectiveRecoveryBundleDiscountPercent ??
      undefined,
  };
  const pendingOffer = getPendingRecoveryOffer(history, {
    discount,
    bundle,
  });
  const shouldTry =
    looksLikeCheckoutMessage(latestUserMessage, history) ||
    (pendingOffer != null &&
      parseCheckoutDetails(latestUserMessage) != null);

  if (!shouldTry) return null;

  const details = parseCheckoutDetails(latestUserMessage);
  if (!details) {
    // Only nudge if they clearly tried to check out / accept an offer
    if (
      looksLikeCheckoutMessage(latestUserMessage, history) ||
      pendingOffer
    ) {
      return `I can place that order — please send your details like this:\n\n${orderDetailsTemplate(
        { defaultQty: pendingOffer?.defaultQty }
      )}`;
    }
    return null;
  }

  const productRef =
    findProductRefFromHistory([
      ...history,
      { role: "user", content: latestUserMessage },
    ]) || findProductRefFromHistory(history);

  if (!productRef) {
    return "I have your details. Which product should I order? Please send the product name or SKU again.";
  }

  const quantity = parseOrderQuantity(
    latestUserMessage,
    pendingOffer?.defaultQty ?? 1
  );
  const discountPercent =
    pendingOffer?.percent && pendingOffer.percent > 0
      ? pendingOffer.percent
      : undefined;

  console.log(
    `[checkout] placing order store=${ctx.store.id} sku=${productRef.sku ?? ""} variant=${productRef.variant_id ?? ""} source=${productRef.source ?? ""} qty=${quantity} discount=${discountPercent ?? 0} phone=${details.phone}`
  );

  const { result } = await executeSalesTool(
    "create_draft_order",
    {
      line_items: [
        {
          quantity,
          ...(productRef.sku ? { sku: productRef.sku } : {}),
          ...(productRef.variant_id
            ? { variant_id: productRef.variant_id }
            : {}),
          ...(productRef.product_id
            ? { product_id: productRef.product_id }
            : {}),
          ...(productRef.source ? { source: productRef.source } : {}),
        },
      ],
      customer_name: details.customer_name,
      phone: details.phone,
      address1: details.address1,
      city: details.city,
      ...(discountPercent != null
        ? { discount_percent: discountPercent }
        : {}),
    },
    ctx
  );

  if (
    result &&
    typeof result === "object" &&
    "success" in result &&
    (result as { success?: boolean }).success
  ) {
    const r = result as {
      order_number?: string;
      total_formatted?: string;
      whatsapp_sent?: boolean;
      whatsapp_error?: string;
    };
    return formatOrderSuccess({
      ...r,
      phone: details.phone,
      customer_name: details.customer_name,
      quantity,
      discountPercent,
    });
  }

  const err =
    result && typeof result === "object" && "error" in result
      ? String((result as { error: unknown }).error)
      : "Could not create the order";

  console.error("[tryDirectCheckoutReply]", err);
  return `I couldn't complete the order yet (${err}). Please confirm the product SKU/name and your address, or wait for a team member.`;
}
