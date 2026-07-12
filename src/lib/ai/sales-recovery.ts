import { formatMoney } from "@/lib/currency";
import {
  extractSkuFromText,
  getStoreProductBySku,
} from "@/lib/products/products-service";
import type { AgentContext } from "./sales-tools";
import { looksLikeCheckoutMessage } from "./checkout-reply";

const DECLINE_PATTERN =
  /\b(don'?t\s+want|do\s+not\s+want|not\s+(interested|now|today|ordering|buying)|no\s+thanks|no\s+thank\s+you|nah+|nope|not\s+for\s+me|maybe\s+later|later|skip|cancel|i'?ll\s+pass|no\s+order|won'?t\s+(order|buy)|expensive|too\s+(much|pricey|costly)|can'?t\s+afford)\b/i;

const HARD_STOP_PATTERN =
  /\b(stop\s+(messaging|texting|contacting)|unsubscribe|leave\s+me\s+alone|never\s+(message|contact)|block|spam)\b/i;

const ACCEPT_OFFER_PATTERN =
  /\b(yes|yeah|yep|ok|okay|sure|deal|fine|alright|i('ll| will)\s+take|interested|accept|go\s+ahead|order\s+(it|now|this)|book\s+it|let'?s\s+do\s+it)\b/i;

const DISCOUNT_OFFERED_PATTERN =
  /\b(15\s*%|\b15 percent\b|special\s+discount|limited\s+discount|off\s+just\s+for\s+you)\b/i;

const BUNDLE_OFFERED_PATTERN =
  /\b(2[\s-]?pack|bundle|buy\s+2|two\s+units|pack\s+of\s+2)\b/i;

const PRODUCT_OFFERED_PATTERN =
  /\b(would you like to order|want to order|place the order|share your full name|SKU:|Price:|From:)\b/i;

function lastAssistantMessages(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  n = 6
): string[] {
  return history
    .filter((m) => m.role === "assistant")
    .slice(-n)
    .map((m) => m.content);
}

function findProductContext(
  history: Array<{ role: "user" | "assistant"; content: string }>
): { sku: string | null; title: string | null; priceText: string | null } {
  const assistants = lastAssistantMessages(history, 8);
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
            !/^(SKU:|Ref:|Price:|From:|Stock:|Options:|Variants|Bundles:|Would you)/i.test(
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

function recoveryStage(
  history: Array<{ role: "user" | "assistant"; content: string }>
): "none" | "discount" | "bundle" | "exhausted" {
  const recent = lastAssistantMessages(history, 8).join("\n");
  const discount = DISCOUNT_OFFERED_PATTERN.test(recent);
  const bundle = BUNDLE_OFFERED_PATTERN.test(recent);
  if (bundle) return "exhausted";
  if (discount) return "bundle";
  if (PRODUCT_OFFERED_PATTERN.test(recent)) return "discount";
  return "none";
}

export function looksLikeOrderDecline(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (looksLikeCheckoutMessage(t)) return false;
  if (HARD_STOP_PATTERN.test(t)) return true;
  // Short nos after an ask-to-order
  if (/^(no|nope|nah|not now|maybe later)\.?$/i.test(t)) return true;
  return DECLINE_PATTERN.test(t);
}

export function looksLikeOfferAcceptance(text: string): boolean {
  const t = text.trim();
  if (looksLikeCheckoutMessage(t)) return false;
  if (looksLikeOrderDecline(t)) return false;
  return ACCEPT_OFFER_PATTERN.test(t) && t.length <= 80;
}

/**
 * After product details + ask-to-order, if customer declines:
 * 1) 15% discount  2) 2-pack bundle  3) polite stop
 * Also handles soft "yes" to an offer by asking for name/phone/address.
 */
export async function tryDirectSalesRecoveryReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string | null> {
  const assistants = lastAssistantMessages(history, 8);
  const recentAssistant = assistants.join("\n");
  const hadProductPitch = PRODUCT_OFFERED_PATTERN.test(recentAssistant);
  if (!hadProductPitch) return null;

  const product = findProductContext(history);
  const productLabel = product.title || "this product";

  // Soft accept of a recovery offer → close with contact collection
  if (looksLikeOfferAcceptance(latestUserMessage)) {
    const offeredDiscount = DISCOUNT_OFFERED_PATTERN.test(recentAssistant);
    const offeredBundle = BUNDLE_OFFERED_PATTERN.test(recentAssistant);
    if (!offeredDiscount && !offeredBundle) return null;

    if (offeredBundle) {
      return `Great choice! I'll lock in the 2-pack deal for ${productLabel}${
        product.sku ? ` (${product.sku})` : ""
      }.\n\nPlease share:\n1) Full name\n2) Phone (for confirmation)\n3) Full delivery address (with city)\n\nI'll place the order with the bundle discount right away.`;
    }

    return `Awesome — I'll apply the 15% discount on ${productLabel}${
      product.sku ? ` (${product.sku})` : ""
    }.\n\nPlease share:\n1) Full name\n2) Phone (for confirmation)\n3) Full delivery address (with city)\n\nOnce I have that, I'll confirm your order.`;
  }

  if (!looksLikeOrderDecline(latestUserMessage)) return null;

  if (HARD_STOP_PATTERN.test(latestUserMessage)) {
    return "Understood — I won't push further. If you need anything later, just message us. Have a great day!";
  }

  const stage = recoveryStage(history);

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

  if (stage === "discount" || stage === "none") {
    const discounted =
      unitPrice != null && Number.isFinite(unitPrice)
        ? formatMoney(Math.round(unitPrice * 0.85 * 100) / 100, currency)
        : null;
    const was =
      unitPrice != null && Number.isFinite(unitPrice)
        ? formatMoney(unitPrice, currency)
        : product.priceText;

    return [
      `No worries at all! Before you go — I can offer you ${productLabel} at *15% off* just for you${
        was && discounted ? ` (${was} → ${discounted})` : discounted ? ` (${discounted})` : ""
      }.`,
      ``,
      `It's a limited WhatsApp deal. Want me to reserve it?`,
      `Reply YES and share your name, phone, and delivery address — I'll place it with the discount.`,
    ].join("\n");
  }

  if (stage === "bundle") {
    const bundleTotal =
      unitPrice != null && Number.isFinite(unitPrice)
        ? formatMoney(Math.round(unitPrice * 2 * 0.75 * 100) / 100, currency)
        : null;
    const twoFull =
      unitPrice != null && Number.isFinite(unitPrice)
        ? formatMoney(unitPrice * 2, currency)
        : null;

    return [
      `Totally fine — last offer: a *2-pack bundle* of ${productLabel} with about *25% off* the 2-unit total${
        twoFull && bundleTotal ? ` (${twoFull} → ${bundleTotal})` : bundleTotal ? ` (${bundleTotal})` : ""
      }.`,
      ``,
      `Great value if you want a spare or to share. Interested?`,
      `Reply YES with your name, phone, and address and I'll confirm the bundle order.`,
    ].join("\n");
  }

  // Exhausted recovery steps
  return `I understand — thank you for considering ${productLabel}. If you change your mind or need help with another product or an existing order, just message anytime. Have a wonderful day!`;
}
