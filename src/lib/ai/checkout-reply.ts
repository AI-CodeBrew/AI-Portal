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
import {
  customerMsg,
  detectCustomerLanguage,
  type CustomerReplyLanguage,
} from "./customer-language";

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
  lang: CustomerReplyLanguage;
}): string {
  return [
    customerMsg("orderConfirmed", params.lang, {
      order: params.order_number ?? "",
    }),
    params.quantity > 1
      ? `${customerMsg("qty", params.lang)} ${params.quantity}`
      : null,
    params.discountPercent != null
      ? customerMsg("discountApplied", params.lang, {
          percent: params.discountPercent,
        })
      : null,
    params.total_formatted
      ? `${customerMsg("total", params.lang)} ${params.total_formatted}`
      : null,
    params.whatsapp_sent
      ? customerMsg("confirmationSent", params.lang, { phone: params.phone })
      : null,
    customerMsg("thanks", params.lang, { name: params.customer_name }),
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

  const lang = detectCustomerLanguage(history, latestUserMessage);

  const details = parseCheckoutDetails(latestUserMessage);
  if (!details) {
    // Only nudge if they clearly tried to check out / accept an offer
    if (
      looksLikeCheckoutMessage(latestUserMessage, history) ||
      pendingOffer
    ) {
      return `${customerMsg("checkoutNeedDetails", lang)}\n\n${orderDetailsTemplate(
        { defaultQty: pendingOffer?.defaultQty, lang }
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
    return customerMsg("checkoutWhichProduct", lang);
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
      ...(pendingOffer?.type
        ? { recovery_deal_type: pendingOffer.type }
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
      lang,
    });
  }

  const err =
    result && typeof result === "object" && "error" in result
      ? String((result as { error: unknown }).error)
      : "Could not create the order";

  console.error("[tryDirectCheckoutReply]", err);
  return customerMsg("checkoutFailed", lang, { error: err });
}
