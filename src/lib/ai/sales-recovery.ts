import { formatMoney } from "@/lib/currency";
import {
  extractSkuFromText,
  getStoreProductBySku,
} from "@/lib/products/products-service";
import { checkStock, getShopCurrency } from "@/lib/shopify";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_SETTING_DEFAULTS } from "./ai-settings-types";
import type { AgentContext } from "./sales-tools";
import {
  looksLikeCheckoutMessage,
  parseCheckoutDetails,
  looksLikeStillShoppingMessage,
} from "./checkout-parse";
import { orderDetailsTemplate } from "./order-details-template";
import { findActiveProductContext } from "./product-reply";

export {
  extractOutboundMedia,
  stripInternalAiMarkers,
} from "./message-markers";

const DECLINE_PATTERN =
  /\b(don'?t\s+want|dont\s+want|do\s+not\s+want|not\s+(interested|now|today|ordering|buying|want)|no\s+thanks|no\s+thank\s+you|nah+|nope|not\s+for\s+me|maybe\s+later|later|skip|cancel|i'?ll\s+pass|no\s+order|won'?t\s+(order|buy)|not\s+going\s+to\s+(buy|order)|wnt\s+to\s+order|expens\w*|xpens\w*|costly|too\s+(much|pricey|costly)|(?:price|cost|rate)\s+(is\s+)?(too\s+)?high|high\s+(price|cost)|can'?t\s+afford|\bbudget\b|over\s+budget|out\s+of\s+(my\s+)?budget|overpriced|not\s+worth|discount|discounts|any\s+offers?|better\s+(price|deal|offer)|special\s+(price|offer|deal)|last\s+price|best\s+price|final\s+price|reduce\s+(the\s+)?price|lower\s+(the\s+)?price|cheaper|sasta|offer\s+(me|please)|give\s+(me\s+)?(a\s+)?(discount|offer)|can\s+(you|u)\s+give|\d+\s*%\s*off|%\s*off|percent(?:age)?\s+off|bulk\s*(order|discount|deal|off|price)?|on\s+bulk)\b/i;

const HARD_STOP_PATTERN =
  /\b(stop\s+(messaging|texting|contacting)|unsubscribe|leave\s+me\s+alone|never\s+(message|contact)|block|spam)\b/i;

const ACCEPT_OFFER_PATTERN =
  /\b(yes|yeah|yep|ok|okay|sure|deal|fine|alright|i('ll| will)\s+take|interested|accept|go\s+ahead|order\s+(it|now|this)|book\s+it|let'?s\s+do\s+it)\b/i;

/** Detect product pitch in assistant text (avoid \\b before [, ?, — — they break matching). */
const PRODUCT_OFFERED_PATTERN =
  /(?:\[(?:Ref|Objection)|want it\?|share your phone|delivery address|would you like to order|want to order|place the order|reply like this|share your full name|share name, phone|Deal 1\/2|Deal 2\/2|𝟮-𝗣𝗔𝗖𝗞|𝗙𝗟𝗔𝗧|FLAT.*OFF|(?:—|-)\s*(?:Rs\.?|PKR|AED|\$|€)\s*[\d,]+|\b(?:in stock|out of stock right now|SKU:|Price:|From:))/i;

export function productOfferedInHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): boolean {
  return history.some(
    (m) => m.role === "assistant" && PRODUCT_OFFERED_PATTERN.test(m.content)
  );
}

/** True when last assistant turn was already a "Did you mean…?" clarify (avoid loops). */
export function lastAssistantWasProductClarify(
  history: Array<{ role: "user" | "assistant"; content: string }>
): boolean {
  const last = [...history].reverse().find((m) => m.role === "assistant");
  if (!last) return false;
  return (
    /Did you mean \*/i.test(last.content) ||
    /Just to confirm — you want \*/i.test(last.content)
  );
}

function discountMarker(percent: number) {
  return `[Deal 1/2 — ${percent}% off]`;
}

function bundleMarker(percent: number) {
  return `[Deal 2/2 — 2-pack bundle ${percent}% off]`;
}

const MARKER_CLOSED = "[Deal closed]";
const MARKER_VALUE_PITCH = "[Objection — value pitch]";

function lastAssistantMessages(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  n = 12
): string[] {
  return history
    .filter((m) => m.role === "assistant")
    .slice(-n)
    .map((m) => m.content);
}

function extractRefFromAssistant(content: string): string | null {
  return (
    content.match(/\[Ref:\s*([0-9a-f-]{36}|\d{5,})\]/i)?.[1] ||
    content.match(/\bRef:\s*([0-9a-f-]{36}|\d{5,})\b/i)?.[1] ||
    null
  );
}

/** Parse amounts like "AED 299.00", "Rs 1,200", "299" from Price: lines. */
function parsePriceAmount(text: string | null | undefined): number | null {
  if (!text || /see store for price/i.test(text)) return null;
  const cleaned = text.replace(/,/g, "");
  const m = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Greetings, fallbacks, and offer lines — not a product name. */
function isGenericAssistantLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return true;
  return (
    /^hey\b/i.test(t) ||
    /^hi\b/i.test(t) ||
    /send me (the )?product name or sku/i.test(t) ||
    /what product (are you|can I)/i.test(t) ||
    /^no problem/i.test(t) ||
    /^all good/i.test(t) ||
    /^\[Deal/i.test(t) ||
    /^I (can|get it|hear you|wanted to)/i.test(t) ||
    /^Let me offer/i.test(t) ||
    /^Totally fine/i.test(t) ||
    /^Understand/i.test(t) ||
    /^Sorry/i.test(t) ||
    /^No worries/i.test(t)
  );
}

function productLabelFromContext(title: string | null | undefined): string {
  const t = title?.trim();
  if (t && !isGenericAssistantLine(t)) return t;
  return "this item";
}

function formatRecoveryCloseReply(title: string | null): string {
  const label = title?.trim() && !isGenericAssistantLine(title) ? title.trim() : null;
  return [
    MARKER_CLOSED,
    label
      ? `All good 👍 No worries. Thanks for checking ${label} — ping us anytime you need help.`
      : `All good 👍 No worries. Ping us anytime you need help.`,
  ].join("\n");
}

function findProductContext(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  latestUserMessage?: string
): {
  sku: string | null;
  title: string | null;
  priceText: string | null;
  variantRef: string | null;
} {
  const active = findActiveProductContext(history, latestUserMessage);
  let sku = active?.sku ?? null;
  let title = active?.title ?? null;
  let priceText: string | null = null;
  let variantRef = active?.ref ?? null;

  if (title && isGenericAssistantLine(title)) {
    title = null;
  }

  const assistants = lastAssistantMessages(history, 12);
  for (const content of [...assistants].reverse()) {
    if (!variantRef) variantRef = extractRefFromAssistant(content);
    if (!priceText) {
      const m =
        content.match(/(?:Price|From):\s*([^\n]+)/i) ||
        content.match(
          /(?:^|\n)[^\n]+(?:—|-)\s*((?:Rs\.?|PKR|AED|\$|€)\s*[\d,]+(?:\.\d+)?)/im
        );
      if (m?.[1] && !/see store for price/i.test(m[1])) {
        priceText = m[1].trim();
      }
    }
    if (!priceText) {
      const offerNow = content.match(
        /instead of [~*][^~*\n]+[~*][^*\n]*\*([^*]+)\*/i
      );
      if (offerNow?.[1]) priceText = offerNow[1].trim();
    }
    if (!title && /\[Ref:|(?:^|\n)[^\n]+(?:—|-)\s*(?:Rs\.?|PKR|AED|\$|€)/im.test(content)) {
      const dash = content.match(
        /(?:^|\n)([^\n]+?)\s*(?:—|-)\s*(?:Rs\.?|PKR|AED|\$|€)/im
      );
      if (dash?.[1]) {
        const candidate = dash[1].replace(/\*([^*]+)\*/g, "$1").trim();
        if (candidate && !isGenericAssistantLine(candidate)) {
          title = candidate;
        }
      }
    }
    if (!sku) sku = extractSkuFromText(content);
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

  return { sku, title, priceText, variantRef };
}

async function resolveUnitPrice(
  ctx: AgentContext,
  product: {
    sku: string | null;
    priceText: string | null;
    variantRef: string | null;
  }
): Promise<{ unitPrice: number | null; currency: string }> {
  let unitPrice: number | null = null;
  let currency = ctx.storeCurrency || "PKR";

  if (product.sku) {
    try {
      const portal = await getStoreProductBySku(ctx.store.id, product.sku);
      if (portal) {
        const p = Number(portal.variants?.[0]?.price ?? portal.price);
        if (Number.isFinite(p) && p > 0) {
          return { unitPrice: p, currency: portal.currency || currency };
        }
      }
    } catch (err) {
      console.error("[sales-recovery] portal lookup failed:", err);
    }
  }

  const shopDomain = ctx.store.shop_domain;
  const shopifyToken = ctx.store.shopify_access_token;
  if (shopDomain && shopifyToken) {
    try {
      currency =
        (await getShopCurrency(shopDomain, shopifyToken)) || currency;
    } catch {
      // keep fallback currency
    }

    let variantId = product.variantRef?.trim() || "";
    if (!/^\d{5,}$/.test(variantId) && product.sku) {
      try {
        const supabase = createAdminClient();
        const { data } = await supabase
          .from("shopify_product_skus")
          .select("shopify_variant_id")
          .eq("store_id", ctx.store.id)
          .ilike("sku", product.sku)
          .maybeSingle();
        variantId = String(data?.shopify_variant_id ?? "").trim();
      } catch (err) {
        console.error("[sales-recovery] SKU registry lookup failed:", err);
      }
    }

    if (/^\d{5,}$/.test(variantId)) {
      try {
        const stock = await checkStock(shopDomain, shopifyToken, variantId);
        const p = Number(stock.price);
        if (Number.isFinite(p) && p > 0) {
          return { unitPrice: p, currency };
        }
      } catch (err) {
        console.error("[sales-recovery] Shopify price fetch failed:", err);
      }
    }
  }

  const fromText = parsePriceAmount(product.priceText);
  if (fromText != null) {
    unitPrice = fromText;
  }

  return { unitPrice, currency };
}

function priceCompareLine(
  unitPrice: number | null,
  percent: number,
  currency: string,
  qty = 1
): string | null {
  if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice <= 0) {
    return null;
  }
  const was = formatMoney(unitPrice * qty, currency);
  const now = formatMoney(
    Math.round(unitPrice * qty * (1 - percent / 100) * 100) / 100,
    currency
  );
  // WhatsApp strikethrough: ~text~
  return `~${was}~  →  *${now}*`;
}

function newestRecoveryOfferMessage(
  assistants: string[]
): string | null {
  for (const content of [...assistants].reverse()) {
    if (
      /\[Deal\s+[12]\/2/i.test(content) ||
      /𝟮-𝗣𝗔𝗖𝗞|2-PACK|𝗕𝗨𝗡𝗗𝗟𝗘|𝗙𝗟𝗔𝗧.*𝗢𝗙𝗙|FLAT.*OFF/i.test(content)
    ) {
      return content;
    }
  }
  return null;
}

function percentFromOfferMessage(
  content: string,
  fallback: number
): number {
  const marker =
    content.match(/\[Deal\s+[12]\/2[^\]]*?\b(\d{1,2})\s*%\s*off\]/i) ||
    content.match(/\b(\d{1,2})\s*%\s*off\b/i);
  const n = marker ? Number(marker[1]) : fallback;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isBundleOfferMessage(content: string): boolean {
  return (
    /\[Deal\s+2\/2/i.test(content) ||
    /𝟮-𝗣𝗔𝗖𝗞|2-PACK|𝗕𝗨𝗡𝗗𝗟𝗘/i.test(content)
  );
}

function isDiscountOfferMessage(content: string): boolean {
  return (
    /\[Deal\s+1\/2/i.test(content) ||
    /𝗙𝗟𝗔𝗧|FLAT.*OFF/i.test(content)
  );
}

function isValuePitchMessage(content: string): boolean {
  return /\[Objection — value pitch\]/i.test(content);
}

function hasValuePitchInHistory(assistants: string[]): boolean {
  return assistants.some(isValuePitchMessage);
}

function shortenDescription(description: string | null): string | null {
  if (!description?.trim()) return null;
  const clean = description
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length < 20) return null;
  const firstSentence = clean.split(/[.!?]/)[0]?.trim();
  if (firstSentence && firstSentence.length >= 20 && firstSentence.length <= 140) {
    return firstSentence;
  }
  return clean.length > 120 ? `${clean.slice(0, 117).trim()}…` : clean;
}

async function resolveProductDescription(
  ctx: AgentContext,
  sku: string | null
): Promise<string | null> {
  if (!sku) return null;
  try {
    const portal = await getStoreProductBySku(ctx.store.id, sku);
    if (!portal) return null;
    return shortenDescription(portal.description || portal.tagline || null);
  } catch (err) {
    console.error("[sales-recovery] description lookup failed:", err);
    return null;
  }
}

function formatValueReassuranceReply(params: {
  productLabel: string;
  priceText: string | null;
  description: string | null;
}): string {
  const { productLabel, priceText, description } = params;
  const qualityLine = description
    ? `${description.charAt(0).toUpperCase()}${description.slice(1)} — that's a big part of why it's priced where it is.`
    : `It's one of our better-built items — solid quality and made to last, not a cheap throwaway.`;

  const priceLine = priceText
    ? `At ${priceText.trim()}, you're paying for that quality upfront instead of replacing it later.`
    : `You're paying for quality that holds up — not something you'd swap out in a few months.`;

  return [
    MARKER_VALUE_PITCH,
    `I hear you — ${productLabel} isn't the cheapest option out there.`,
    qualityLine,
    priceLine,
    `Honestly, do you think it fits what you need, or is budget the main thing holding you back?`,
  ].join("\n");
}

function formatPersonalOfferLine(
  type: "discount" | "bundle",
  percent: number,
  productLabel: string,
  unitPrice: number | null,
  currency: string
): string {
  const compare = priceCompareLine(
    unitPrice,
    percent,
    currency,
    type === "bundle" ? 2 : 1
  );
  if (type === "bundle") {
    const now = compare?.match(/\*([^*]+)\*/)?.[1];
    const was = compare?.match(/~([^~]+)~/i)?.[1];
    if (now && was) {
      return `I wanted to personally offer you a *2-pack bundle (${percent}% off)* on *${productLabel}* — *${now}* instead of ${was}.`;
    }
    return [
      `I wanted to personally offer you a *2-pack bundle (${percent}% off)* on *${productLabel}*`,
      compare,
    ]
      .filter(Boolean)
      .join("\n");
  }
  const now = compare?.match(/\*([^*]+)\*/)?.[1];
  const was = compare?.match(/~([^~]+)~/i)?.[1];
  if (now && was) {
    return `I wanted to personally offer you *${percent}% off* on *${productLabel}* — *${now}* instead of ${was}.`;
  }
  return `I wanted to personally offer you *${percent}% off* on *${productLabel}*.${compare ? `\n${compare}` : ""}`;
}

function formatRecoveryOfferReply(params: {
  type: "discount" | "bundle";
  percent: number;
  productLabel: string;
  sku: string | null;
  unitPrice: number | null;
  currency: string;
  accepting?: boolean;
}): string {
  const { type, percent, productLabel, unitPrice, currency } = params;
  const personal = formatPersonalOfferLine(
    type,
    percent,
    productLabel,
    unitPrice,
    currency
  );

  if (params.accepting) {
    return [
      type === "bundle"
        ? `🔥 Locked in: *2-PACK* at *${percent}% OFF*`
        : `🔥 Deal locked: *${percent}% OFF*`,
      personal,
      orderDetailsTemplate({ defaultQty: type === "bundle" ? 2 : 1 }),
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (type === "bundle") {
    return [
      bundleMarker(percent),
      `If budget's tight, I can do a *2-pack bundle at ${percent}% off* — best value if you need more than one.`,
      personal,
      `Want it? Share phone & full address (qty 2). Name optional.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const now =
    unitPrice != null && Number.isFinite(unitPrice) && unitPrice > 0
      ? formatMoney(
          Math.round(unitPrice * (1 - percent / 100) * 100) / 100,
          currency
        )
      : personal.match(/\*([^*]+)\*/g)?.pop()?.replace(/\*/g, "") ?? null;
  const simpleOffer =
    now != null && !/^\d+\s*%/i.test(now)
      ? `I can do *${percent}% off* — that's *${now}*.`
      : `I can do *${percent}% off* on *${productLabel}*.`;

  return [
    discountMarker(percent),
    `I get it — let me see what I can do for you.`,
    simpleOffer,
    `Want to go ahead? Share phone & delivery address (name optional).`,
  ]
    .filter(Boolean)
    .join("\n");
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
): "reassure" | "discount" | "bundle" | "close" | null {
  const assistants = lastAssistantMessages(history, 12);
  const recent = assistants.join("\n");

  if (recent.includes(MARKER_CLOSED) || /\[Deal closed\]/i.test(recent)) {
    return null;
  }

  const lastOffer = newestRecoveryOfferMessage(assistants);
  if (lastOffer && isBundleOfferMessage(lastOffer)) {
    return "close";
  }
  if (lastOffer && isDiscountOfferMessage(lastOffer)) {
    return "bundle";
  }
  if (hasValuePitchInHistory(assistants)) {
    return "discount";
  }

  return "reassure";
}

/** Detect an open recovery offer in chat (for checkout discount + qty). */
export function getPendingRecoveryOffer(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  defaults?: { discount?: number; bundle?: number }
): { type: "discount" | "bundle"; percent: number; defaultQty: number } | null {
  const assistants = lastAssistantMessages(history, 8);
  const recent = assistants.join("\n");
  if (recent.includes(MARKER_CLOSED)) return null;

  const defaultDiscount =
    defaults?.discount && defaults.discount > 0
      ? defaults.discount
      : AI_SETTING_DEFAULTS.recoveryDiscountPercent;
  const defaultBundle =
    defaults?.bundle && defaults.bundle > 0
      ? defaults.bundle
      : AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent;

  const lastOffer = newestRecoveryOfferMessage(assistants);
  if (!lastOffer) return null;

  if (isBundleOfferMessage(lastOffer)) {
    return {
      type: "bundle",
      percent: percentFromOfferMessage(lastOffer, defaultBundle),
      defaultQty: 2,
    };
  }

  if (isDiscountOfferMessage(lastOffer)) {
    return {
      type: "discount",
      percent: percentFromOfferMessage(lastOffer, defaultDiscount),
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
  // Asking for other products is browse — not a price decline
  if (
    /\b(different|other|more)\s+products?\b/i.test(t) ||
    /\bshare\s+(?:me\s+)?(?:some\s+)?(?:other|different|more)\b/i.test(t)
  ) {
    return false;
  }
  if (looksLikeCheckoutMessage(t)) return false;
  if (HARD_STOP_PATTERN.test(t)) return true;
  if (/^(no|nope|nah|not now|maybe later|no thanks|don't want)\.?$/i.test(t)) {
    return true;
  }
  return DECLINE_PATTERN.test(t);
}

export function looksLikeOfferAcceptance(text: string): boolean {
  const t = text.trim();
  // If contact details are already in the message, checkout places the order
  if (parseCheckoutDetails(t)) return false;
  if (looksLikeCheckoutMessage(t)) return false;
  if (looksLikeStillShoppingMessage(t)) return false;
  if (looksLikeOrderDecline(t)) return false;
  return ACCEPT_OFFER_PATTERN.test(t) && t.length <= 120;
}

export async function tryDirectSalesRecoveryReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string | null> {
  const assistants = lastAssistantMessages(history, 12);
  const recentAssistant = assistants.join("\n");
  const hadProductPitch = PRODUCT_OFFERED_PATTERN.test(recentAssistant);

  // Discount/offer ask with no product in chat yet — don't SKU-search "discount"
  if (!hadProductPitch && looksLikeOrderDecline(latestUserMessage)) {
    if (
      /\b(discount|offer|cheaper|sasta|best\s+price|last\s+price|special\s+price)\b/i.test(
        latestUserMessage
      )
    ) {
      return `Prices are already set for quality — which product are you looking at? Send the name or SKU and I'll pull it up.`;
    }
    return null;
  }

  if (!hadProductPitch) return null;

  const product = findProductContext(history, latestUserMessage);
  const productLabel = productLabelFromContext(product.title);
  const { discount, bundle } = recoveryPercents(ctx);
  const { unitPrice, currency } = await resolveUnitPrice(ctx, product);
  const description = await resolveProductDescription(ctx, product.sku);

  // Soft accept without details yet → ask for name / phone / address
  if (looksLikeOfferAcceptance(latestUserMessage)) {
    const pending = getPendingRecoveryOffer(history, { discount, bundle });
    if (!pending) return null;

    return formatRecoveryOfferReply({
      type: pending.type,
      percent: pending.percent,
      productLabel,
      sku: product.sku,
      unitPrice,
      currency,
      accepting: true,
    });
  }

  if (!looksLikeOrderDecline(latestUserMessage)) return null;

  if (HARD_STOP_PATTERN.test(latestUserMessage)) {
    return `${MARKER_CLOSED}\nOkay — I won't push. Message anytime if you need help.`;
  }

  const action = nextRecoveryAction(history);
  if (!action) return null;

  if (action === "reassure") {
    return formatValueReassuranceReply({
      productLabel,
      priceText: product.priceText,
      description,
    });
  }

  if (action === "discount") {
    return formatRecoveryOfferReply({
      type: "discount",
      percent: discount,
      productLabel,
      sku: product.sku,
      unitPrice,
      currency,
    });
  }

  if (action === "bundle") {
    return formatRecoveryOfferReply({
      type: "bundle",
      percent: bundle,
      productLabel,
      sku: product.sku,
      unitPrice,
      currency,
    });
  }

  return formatRecoveryCloseReply(product.title);
}
