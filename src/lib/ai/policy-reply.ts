import type { AgentContext } from "./sales-tools";
import { getPlatformAiDefaults } from "./platform-defaults";

/** Default delivery promise used when customer asks ETA (not tracking). */
export const DEFAULT_DELIVERY_ETA_DAYS = "3–5 days";

/**
 * Damaged-in-transit / failed-delivery refund policy.
 * {{supportPhone}} is replaced with platform/store support number.
 */
export const DEFAULT_DAMAGED_RETURN_POLICY =
  "If the product arrives damaged by the delivery partner, send clear photos of the product and the failed/damaged delivery note to {{supportPhone}}. Once we verify, we'll arrange your refund.";

const DELIVERY_ETA_PATTERN =
  /\b(deliver(y|ies)?|shipping|ship|arrive|arrival|kitne\s*din|kitna\s*(time|din)|kab\s*(milega|aayega|pahuchega)|when\s+(will|does|do)\s+(it|this|the\s+order|my\s+order)\s+(arrive|come|deliver)|how\s+long.*(deliver|ship|arrive|take)|delivery\s*(time|days|eta)|shipping\s*time)\b/i;

const DELIVERY_EXCLUDE =
  /\b(address|addr|location|house|street|city|phone|name|place\s+(an?\s+)?order|order\s+now)\b/i;

const RETURN_DAMAGE_PATTERN =
  /\b(return\s+policy|refund\s+policy|refund|return|exchange|damaged|damage|broken|defective|defect|wrong\s+item|failed\s+delivery|delivery\s+partner|courier\s+(broke|damage)|parcel\s+(damaged|broken))\b/i;

const ORDER_STATUS_PATTERN =
  /\b(where\s+is\s+my\s+order|track(ing)?|order\s+status|shipment\s+status)\b/i;

export function looksLikeDeliveryEtaQuestion(message: string): boolean {
  const t = message.trim();
  if (t.length < 4) return false;
  if (ORDER_STATUS_PATTERN.test(t)) return false;
  if (DELIVERY_EXCLUDE.test(t) && !DELIVERY_ETA_PATTERN.test(t)) return false;
  // "delivery address" / checkout details — not ETA
  if (/\bdelivery\s+address\b/i.test(t)) return false;
  // Cost complaints about shipping — not ETA
  if (
    /\b(expensive|costly|mehnga|hate|high)\b.*\b(shipping|delivery|ship)\b/i.test(
      t
    ) ||
    /\b(shipping|delivery)\b.*\b(expensive|costly|mehnga|fee|charges?)\b/i.test(t)
  ) {
    return false;
  }
  return DELIVERY_ETA_PATTERN.test(t);
}

export function looksLikeReturnOrDamageQuestion(message: string): boolean {
  const t = message.trim();
  if (t.length < 4) return false;
  // Soft stall "I'll return later" without policy/damage words
  if (/^(i('ll| will)\s+)?(return|come\s+back)\s+(later|tomorrow)/i.test(t)) {
    return false;
  }
  return RETURN_DAMAGE_PATTERN.test(t);
}

async function resolveSupportPhoneWithPlatform(
  ctx: AgentContext
): Promise<string> {
  const storePhone = ctx.store.whatsapp_display_phone?.trim();
  if (storePhone) return storePhone;
  try {
    const platform = await getPlatformAiDefaults();
    const phone = platform.supportPhone?.trim();
    if (phone) return phone;
  } catch {
    // fall through
  }
  return "the WhatsApp number you're chatting on";
}

export function buildDeliveryEtaReply(): string {
  return `Delivery usually takes *${DEFAULT_DELIVERY_ETA_DAYS}* after confirmation (working days). Once your order is placed, we'll keep you updated. Want to order now? Share your phone & delivery address.`;
}

export function buildDamagedReturnReply(supportPhone: string): string {
  return DEFAULT_DAMAGED_RETURN_POLICY.replace(
    /\{\{supportPhone\}\}/g,
    `*${supportPhone}*`
  );
}

/** Deterministic delivery / return-policy answers — no LLM inventing ETAs or refunds. */
export async function tryDirectPolicyReply(
  ctx: AgentContext,
  latestUserMessage: string
): Promise<string | null> {
  if (looksLikeDeliveryEtaQuestion(latestUserMessage)) {
    return buildDeliveryEtaReply();
  }
  if (looksLikeReturnOrDamageQuestion(latestUserMessage)) {
    const phone = await resolveSupportPhoneWithPlatform(ctx);
    return buildDamagedReturnReply(phone);
  }
  return null;
}
