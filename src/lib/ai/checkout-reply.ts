import { executeSalesTool, type AgentContext } from "./sales-tools";
import {
  getPendingRecoveryOffer,
  parseOrderQuantity,
} from "./sales-recovery";
import {
  findProductRefFromHistory,
  looksLikeBuyActiveProductIntent,
  looksLikeCheckoutMessage,
  looksLikeProductQuestion,
  parseCheckoutDetails,
  validateCheckoutMessage,
  type CheckoutValidationIssue,
} from "./checkout-parse";
import { resolveOrderLineFromChatRef } from "@/lib/orders/whatsapp-create";
import { orderDetailsTemplate } from "./order-details-template";
import { findActiveProductContext } from "./product-reply";

export {
  looksLikeCheckoutMessage,
  looksLikeBuyActiveProductIntent,
  parseCheckoutDetails,
  validateCheckoutMessage,
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
  const thanksLine =
    params.customer_name && params.customer_name !== "Customer"
      ? `Thanks, ${params.customer_name}!`
      : "Thank you!";

  return [
    `✅ Order *${params.order_number}* confirmed`,
    params.quantity > 1 ? `Qty: ${params.quantity}` : null,
    params.discountPercent != null ? `${params.discountPercent}% off applied` : null,
    params.total_formatted ? `Total: ${params.total_formatted}` : null,
    params.whatsapp_sent
      ? `Confirmation sent to ${params.phone}`
      : null,
    thanksLine,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCheckoutMissingReply(
  issues: CheckoutValidationIssue[],
  defaultQty?: number,
  productLabel?: string | null
): string {
  const lines: string[] = [];

  if (productLabel) {
    lines.push(`Great — locking in *${productLabel}*.`);
  }

  lines.push(
    productLabel
      ? "To confirm your order I need:"
      : "Almost there — to confirm your order I need:"
  );

  if (
    issues.includes("missing_phone") ||
    issues.includes("incomplete_phone") ||
    issues.includes("invalid_phone")
  ) {
    if (issues.includes("incomplete_phone")) {
      lines.push(
        "• *Phone* — the number looks incomplete. Send the full number (e.g. 03XXXXXXXXX or 923XXXXXXXXX)."
      );
    } else if (issues.includes("invalid_phone")) {
      lines.push(
        "• *Phone* — that doesn't look like a valid number. Send digits only, e.g. 03XXXXXXXXX or 923XXXXXXXXX."
      );
    } else {
      lines.push(
        "• *Phone* (required) — send your WhatsApp/mobile number for order confirmation."
      );
    }
  }

  if (issues.includes("missing_address")) {
    lines.push(
      "• *Delivery address* (required) — house/street, area, and city."
    );
  }

  lines.push("\nName is optional.");
  lines.push(
    `\nSend like this:\n\n${orderDetailsTemplate({ defaultQty })}`
  );

  return lines.join("\n");
}

/**
 * When the customer shares phone/address to place an order, create + confirm
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
      validateCheckoutMessage(latestUserMessage, ctx.customerPhone).ok);

  if (!shouldTry) return null;

  if (looksLikeProductQuestion(latestUserMessage, history)) return null;

  const validation = validateCheckoutMessage(
    latestUserMessage,
    ctx.customerPhone
  );

  if (!validation.ok) {
    if (
      looksLikeCheckoutMessage(latestUserMessage, history) ||
      pendingOffer
    ) {
      const active = findActiveProductContext(history, latestUserMessage);
      const productLabel =
        looksLikeBuyActiveProductIntent(latestUserMessage) || active
          ? active?.title ?? null
          : null;
      return formatCheckoutMissingReply(
        validation.issues,
        pendingOffer?.defaultQty,
        productLabel
      );
    }
    return null;
  }

  const details = validation.details;

  const productRef =
    findProductRefFromHistory([
      ...history,
      { role: "user", content: latestUserMessage },
    ]) || findProductRefFromHistory(history);

  if (!productRef) {
    return "I have your details. Which product should I order? Please send the product name or SKU again.";
  }

  const resolvedLine = await resolveOrderLineFromChatRef(ctx.store.id, productRef);
  if (!resolvedLine) {
    const label =
      productRef.sku ||
      (productRef.variant_id ? `ref ${productRef.variant_id.slice(0, 8)}…` : "that product");
    return `I have your delivery details, but ${label} isn't in the catalog anymore. Tell me the product name again and I'll place the order.`;
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
          ...(resolvedLine.sku ? { sku: resolvedLine.sku } : {}),
          ...(resolvedLine.variant_id
            ? { variant_id: resolvedLine.variant_id }
            : {}),
          ...(resolvedLine.product_id
            ? { product_id: resolvedLine.product_id }
            : {}),
          ...(resolvedLine.source ? { source: resolvedLine.source } : {}),
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
    });
  }

  const err =
    result && typeof result === "object" && "error" in result
      ? String((result as { error: unknown }).error)
      : "Could not create the order";

  console.error("[tryDirectCheckoutReply]", err);

  if (/phone|number/i.test(err)) {
    return formatCheckoutMissingReply(["invalid_phone"], pendingOffer?.defaultQty);
  }
  if (/address/i.test(err)) {
    return formatCheckoutMissingReply(["missing_address"], pendingOffer?.defaultQty);
  }
  if (/resolve product|variant|catalog/i.test(err)) {
    return `I have your details but couldn't match the product in our catalog. Reply with the product name once more (e.g. AquaShelf Shower Rack) and send phone + address again — I'll place it right away.`;
  }

  return `I couldn't complete the order yet (${err}). Please wait for a team member or try again in a moment.`;
}
