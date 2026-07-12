import { formatMoney } from "@/lib/currency";
import {
  extractSkuFromText,
  getStoreProductBySku,
} from "@/lib/products/products-service";
import { AI_SETTING_DEFAULTS } from "./ai-settings-types";
import type { AgentContext } from "./sales-tools";
import { looksLikeCheckoutMessage } from "./checkout-reply";

const DECLINE_PATTERN =
  /\b(don'?t\s+want|do\s+not\s+want|not\s+(interested|now|today|ordering|buying)|no\s+thanks|no\s+thank\s+you|nah+|nope|not\s+for\s+me|maybe\s+later|later|skip|cancel|i'?ll\s+pass|no\s+order|won'?t\s+(order|buy)|expensive|too\s+(much|pricey|costly)|can'?t\s+afford)\b/i;

const HARD_STOP_PATTERN =
  /\b(stop\s+(messaging|texting|contacting)|unsubscribe|leave\s+me\s+alone|never\s+(message|contact)|block|spam)\b/i;

const ACCEPT_OFFER_PATTERN =
  /\b(yes|yeah|yep|ok|okay|sure|deal|fine|alright|i('ll| will)\s+take|interested|accept|go\s+ahead|order\s+(it|now|this)|book\s+it|let'?s\s+do\s+it)\b/i;

const PRODUCT_OFFERED_PATTERN =
  /\b(would you like to order|want to order|place the order|share your full name|SKU:|Price:|From:|Deal 1\/2|Deal 2\/2)\b/i;

function discountMarker(percent: number) {
  return `[Deal 1/2 — ${percent}% off]`;
}

function bundleMarker(percent: number) {
  return `[Deal 2/2 — 2-pack bundle ${percent}% off]`;
}

const MARKER_CLOSED = "[Deal closed]";

function lastAssistantMessages(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  n = 12
): string[] {
  return history
    .filter((m) => m.role === "assistant")
    .slice(-n)
    .map((m) => m.content);
}

function findProductContext(
  history: Array<{ role: "user" | "assistant"; content: string }>
): { sku: string | null; title: string | null; priceText: string | null } {
  const assistants = lastAssistantMessages(history, 12);
  let sku: string | null = null;
  let title: string | null = null;
  let priceText: string | null = null;

  for (const content of [...assistants].reverse()) {
    if (!sku) sku = extractSkuFromText(content);
    if (!priceText) {
      const m = content.match(/(?:Price|From):\s*([^\n]+)/i);
      if (m?.[1]) priceText = m[1].trim();
    }
    if (!title) {
      const first = content
        .split("\n")
        .map((l) => l.trim())
        .find(
          (l) =>
            l &&
            !/^(SKU:|Ref:|Price:|From:|Stock:|Options:|Variants|Bundles:|Would you|\[Deal)/i.test(
              l
            )
        );
      if (first && first.length <= 80) title = first;
    }
    if (sku && title) break;
  }

  if (!sku) {
    for (const m of [...history].reverse()) {
      const s = extractSkuFromText(m.content);
      if (s) {
        sku = s;
        break;
      }
    }
  }

  return { sku, title, priceText };
}

function recoveryPercents(ctx: AgentContext): {
  discount: number;
  bundle: number;
} {
  return {
    discount:
      ctx.aiConfig?.effectiveRecoveryDiscountPercent ??
      AI_SETTING_DEFAULTS.recoveryDiscountPercent,
    bundle:
      ctx.aiConfig?.effectiveRecoveryBundleDiscountPercent ??
      AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent,
  };
}

function nextRecoveryAction(
  history: Array<{ role: "user" | "assistant"; content: string }>
): "discount" | "bundle" | "close" | null {
  const recent = lastAssistantMessages(history, 12).join("\n");

  if (recent.includes(MARKER_CLOSED) || /\[Deal closed\]/i.test(recent)) {
    return null;
  }

  if (
    /\[Deal 2\/2/i.test(recent) ||
    /\b2-pack bundle\b/i.test(recent)
  ) {
    return "close";
  }

  if (
    /\[Deal 1\/2/i.test(recent) ||
    /\d+\s*%\s*off/i.test(recent)
  ) {
    return "bundle";
  }

  return "discount";
}

/** Detect an open recovery offer in chat (for checkout discount + qty). */
export function getPendingRecoveryOffer(
  history: Array<{ role: "user" | "assistant"; content: string }>
): { type: "discount" | "bundle"; percent: number; defaultQty: number } | null {
  const recent = lastAssistantMessages(history, 8).join("\n");
  if (recent.includes(MARKER_CLOSED)) return null;

  const bundleMatch = recent.match(
    /\[Deal 2\/2[^\]]*(\d+)\s*%\s*off\]/i
  ) || recent.match(/2-pack bundle[^\d]*(\d+)\s*%/i);
  if (bundleMatch || /\[Deal 2\/2/i.test(recent) || /\b2-pack bundle\b/i.test(recent)) {
    const percent = bundleMatch
      ? Number(bundleMatch[1])
      : AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent;
    return {
      type: "bundle",
      percent: Number.isFinite(percent)
        ? percent
        : AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent,
      defaultQty: 2,
    };
  }

  const discMatch = recent.match(/\[Deal 1\/2[^\]]*(\d+)\s*%\s*off\]/i) ||
    recent.match(/(\d+)\s*%\s*off/i);
  if (discMatch || /\[Deal 1\/2/i.test(recent)) {
    const percent = discMatch
      ? Number(discMatch[1])
      : AI_SETTING_DEFAULTS.recoveryDiscountPercent;
    return {
      type: "discount",
      percent: Number.isFinite(percent)
        ? percent
        : AI_SETTING_DEFAULTS.recoveryDiscountPercent,
      defaultQty: 1,
    };
  }

  return null;
}

export function parseOrderQuantity(
  text: string,
  defaultQty = 1
): number {
  const m =
    text.match(/(?:qty|quantity|pcs|pieces|units|items)\s*[:=]?\s*(\d{1,2})\b/i) ||
    text.match(/\bx\s*(\d{1,2})\b/i) ||
    text.match(/\b(\d{1,2})\s*(?:pcs|pieces|units|items|x)\b/i) ||
    text.match(/\b(?:want|need|order|buy)\s+(\d{1,2})\b/i);
  const n = m ? Number(m[1]) : defaultQty;
  if (!Number.isFinite(n)) return defaultQty;
  return Math.min(50, Math.max(1, Math.round(n)));
}

export function looksLikeOrderDecline(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (looksLikeCheckoutMessage(t)) return false;
  if (HARD_STOP_PATTERN.test(t)) return true;
  if (/^(no|nope|nah|not now|maybe later|no thanks|don't want)\.?$/i.test(t)) {
    return true;
  }
  return DECLINE_PATTERN.test(t);
}

export function looksLikeOfferAcceptance(text: string): boolean {
  const t = text.trim();
  if (looksLikeCheckoutMessage(t)) return false;
  if (looksLikeOrderDecline(t)) return false;
  return ACCEPT_OFFER_PATTERN.test(t) && t.length <= 80;
}

export async function tryDirectSalesRecoveryReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string | null> {
  const assistants = lastAssistantMessages(history, 12);
  const recentAssistant = assistants.join("\n");
  const hadProductPitch = PRODUCT_OFFERED_PATTERN.test(recentAssistant);
  if (!hadProductPitch) return null;

  const product = findProductContext(history);
  const productLabel = product.title || "this product";
  const { discount, bundle } = recoveryPercents(ctx);

  if (looksLikeOfferAcceptance(latestUserMessage)) {
    const pending = getPendingRecoveryOffer(history);
    if (!pending) return null;

    if (pending.type === "bundle") {
      return `Great choice! I'll lock in the 2-pack deal (*${pending.percent}% off*) for ${productLabel}${
        product.sku ? ` (${product.sku})` : ""
      }.\n\nPlease share:\n1) Full name\n2) Phone (for confirmation)\n3) Full delivery address (with city)\n4) Quantity if not 2\n\nI'll place the order with the bundle discount.`;
    }

    return `Awesome — I'll apply *${pending.percent}% off* on ${productLabel}${
      product.sku ? ` (${product.sku})` : ""
    }.\n\nPlease share:\n1) Full name\n2) Phone (for confirmation)\n3) Full delivery address (with city)\n4) Quantity (optional, default 1)\n\nOnce I have that, I'll confirm your order at the discounted price.`;
  }

  if (!looksLikeOrderDecline(latestUserMessage)) return null;

  if (HARD_STOP_PATTERN.test(latestUserMessage)) {
    return `${MARKER_CLOSED}\nUnderstood — I won't push further. If you need anything later, just message us. Have a great day!`;
  }

  const action = nextRecoveryAction(history);
  if (!action) return null;

  let unitPrice: number | null = null;
  let currency = ctx.storeCurrency || "PKR";

  if (product.sku) {
    try {
      const portal = await getStoreProductBySku(ctx.store.id, product.sku);
      if (portal) {
        unitPrice = Number(portal.variants?.[0]?.price ?? portal.price);
        currency = portal.currency || currency;
      }
    } catch (err) {
      console.error("[sales-recovery] product lookup failed:", err);
    }
  }

  if (action === "discount") {
    const factor = 1 - discount / 100;
    const discounted =
      unitPrice != null && Number.isFinite(unitPrice)
        ? formatMoney(Math.round(unitPrice * factor * 100) / 100, currency)
        : null;
    const was =
      unitPrice != null && Number.isFinite(unitPrice)
        ? formatMoney(unitPrice, currency)
        : product.priceText;

    return [
      discountMarker(discount),
      `No worries at all! Before you go — I can offer you ${productLabel} at *${discount}% off* just for you${
        was && discounted
          ? ` (${was} → ${discounted})`
          : discounted
            ? ` (${discounted})`
            : ""
      }.`,
      ``,
      `It's a limited WhatsApp deal. Want me to reserve it?`,
      `Reply YES and share your name, phone, delivery address, and quantity — I'll place it with the discount.`,
    ].join("\n");
  }

  if (action === "bundle") {
    const factor = 1 - bundle / 100;
    const bundleTotal =
      unitPrice != null && Number.isFinite(unitPrice)
        ? formatMoney(
            Math.round(unitPrice * 2 * factor * 100) / 100,
            currency
          )
        : null;
    const twoFull =
      unitPrice != null && Number.isFinite(unitPrice)
        ? formatMoney(unitPrice * 2, currency)
        : null;

    return [
      bundleMarker(bundle),
      `Totally fine — last offer: a *2-pack bundle* of ${productLabel} with *${bundle}% off* the 2-unit total${
        twoFull && bundleTotal
          ? ` (${twoFull} → ${bundleTotal})`
          : bundleTotal
            ? ` (${bundleTotal})`
            : ""
      }.`,
      ``,
      `Great value if you want a spare or to share. Interested?`,
      `Reply YES with your name, phone, and address and I'll confirm the bundle order.`,
    ].join("\n");
  }

  return [
    MARKER_CLOSED,
    `I understand — thank you for considering ${productLabel}. If you change your mind or need help with another product or an existing order, just message anytime. Have a wonderful day!`,
  ].join("\n");
}
