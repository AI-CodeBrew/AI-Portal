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
} from "./checkout-parse";
import { orderDetailsTemplate } from "./order-details-template";

const DECLINE_PATTERN =
  /\b(don'?t\s+want|do\s+not\s+want|not\s+(interested|now|today|ordering|buying)|no\s+thanks|no\s+thank\s+you|nah+|nope|not\s+for\s+me|maybe\s+later|later|skip|cancel|i'?ll\s+pass|no\s+order|won'?t\s+(order|buy)|expensive|too\s+(much|pricey|costly)|can'?t\s+afford)\b/i;

const HARD_STOP_PATTERN =
  /\b(stop\s+(messaging|texting|contacting)|unsubscribe|leave\s+me\s+alone|never\s+(message|contact)|block|spam)\b/i;

const ACCEPT_OFFER_PATTERN =
  /\b(yes|yeah|yep|ok|okay|sure|deal|fine|alright|i('ll| will)\s+take|interested|accept|go\s+ahead|order\s+(it|now|this)|book\s+it|let'?s\s+do\s+it)\b/i;

const PRODUCT_OFFERED_PATTERN =
  /\b(would you like to order|want to order|place the order|reply like this|share your full name|SKU:|Price:|From:|Deal 1\/2|Deal 2\/2)\b/i;

function discountMarker(percent: number) {
  return `[Deal 1/2 — ${percent}% off]`;
}

function bundleMarker(percent: number) {
  return `[Deal 2/2 — 2-pack bundle ${percent}% off]`;
}

const MARKER_CLOSED = "[Deal closed]";

/** Strip internal recovery markers before sending to the customer on WhatsApp. */
export function stripInternalAiMarkers(text: string): string {
  return text
    .replace(/^\s*\[Deal\s+[^\]]+\]\s*\n?/gim, "")
    .replace(/^\s*\[Deal closed\]\s*\n?/gim, "")
    .replace(/^\s*\[Ref:\s*[^\]]+\]\s*\n?/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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

function findProductContext(
  history: Array<{ role: "user" | "assistant"; content: string }>
): {
  sku: string | null;
  title: string | null;
  priceText: string | null;
  variantRef: string | null;
} {
  const assistants = lastAssistantMessages(history, 12);
  let sku: string | null = null;
  let title: string | null = null;
  let priceText: string | null = null;
  let variantRef: string | null = null;

  for (const content of [...assistants].reverse()) {
    if (!sku) sku = extractSkuFromText(content);
    if (!variantRef) variantRef = extractRefFromAssistant(content);
    if (!priceText) {
      const m = content.match(/(?:Price|From):\s*([^\n]+)/i);
      if (m?.[1] && !/see store for price/i.test(m[1])) {
        priceText = m[1].trim();
      }
    }
    if (!title) {
      const bold = content.match(/^\*([^*]+)\*/m);
      if (bold?.[1] && bold[1].trim().length <= 80) {
        title = bold[1].trim();
      } else {
        const first = content
          .split("\n")
          .map((l) => l.trim())
          .find(
            (l) =>
              l &&
              !/^(SKU:|Ref:|\[Ref:|Price:|From:|Stock:|Options:|Variants|Bundles:|Would you|Want to|Reply like|Name:|Phone:|Address:|Qty:|\[Deal)/i.test(
                l
              ) &&
              !l.startsWith("•")
          );
        if (first && first.length <= 80) {
          title = first.replace(/^\*|\*$/g, "").trim();
        }
      }
    }
    if (sku && title && (priceText || variantRef)) break;
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
  return `Was: ${was} → Now: *${now}*`;
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

/** Last regex match in text (prefer newest offer when several appear). */
function lastPercentMatch(
  text: string,
  re: RegExp
): RegExpMatchArray | null {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const matches = [...text.matchAll(new RegExp(re.source, flags))];
  return matches.length ? matches[matches.length - 1] : null;
}

/** Detect an open recovery offer in chat (for checkout discount + qty). */
export function getPendingRecoveryOffer(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  defaults?: { discount?: number; bundle?: number }
): { type: "discount" | "bundle"; percent: number; defaultQty: number } | null {
  const recent = lastAssistantMessages(history, 8).join("\n");
  if (recent.includes(MARKER_CLOSED)) return null;

  const defaultDiscount =
    defaults?.discount && defaults.discount > 0
      ? defaults.discount
      : AI_SETTING_DEFAULTS.recoveryDiscountPercent;
  const defaultBundle =
    defaults?.bundle && defaults.bundle > 0
      ? defaults.bundle
      : AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent;

  // Use \b before digits so "20% off" is not captured as "0" (greedy [^\]]* bug).
  const bundleMatch =
    lastPercentMatch(
      recent,
      /\[Deal\s+2\/2[^\]]*?\b(\d{1,2})\s*%\s*off\]/gi
    ) || lastPercentMatch(recent, /2-pack bundle[^\d]*(\d{1,2})\s*%/gi);
  if (bundleMatch || /\[Deal\s+2\/2/i.test(recent) || /\b2-pack bundle\b/i.test(recent)) {
    const percent = bundleMatch ? Number(bundleMatch[1]) : defaultBundle;
    return {
      type: "bundle",
      percent: Number.isFinite(percent) && percent > 0 ? percent : defaultBundle,
      defaultQty: 2,
    };
  }

  const discMatch =
    lastPercentMatch(
      recent,
      /\[Deal\s+1\/2[^\]]*?\b(\d{1,2})\s*%\s*off\]/gi
    ) || lastPercentMatch(recent, /\b(\d{1,2})\s*%\s*off\b/gi);
  if (discMatch || /\[Deal\s+1\/2/i.test(recent)) {
    const percent = discMatch ? Number(discMatch[1]) : defaultDiscount;
    return {
      type: "discount",
      percent:
        Number.isFinite(percent) && percent > 0 ? percent : defaultDiscount,
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
  // If contact details are already in the message, checkout places the order
  if (parseCheckoutDetails(t)) return false;
  if (looksLikeCheckoutMessage(t)) return false;
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
  if (!hadProductPitch) return null;

  const product = findProductContext(history);
  const productLabel = product.title || "this product";
  const { discount, bundle } = recoveryPercents(ctx);
  const { unitPrice, currency } = await resolveUnitPrice(ctx, product);

  // Soft accept without details yet → ask for name / phone / address
  if (looksLikeOfferAcceptance(latestUserMessage)) {
    const pending = getPendingRecoveryOffer(history, { discount, bundle });
    if (!pending) return null;

    const compare = priceCompareLine(
      unitPrice,
      pending.percent,
      currency,
      pending.type === "bundle" ? 2 : 1
    );

    if (pending.type === "bundle") {
      return [
        `*${pending.percent}% off* 2-pack on ${productLabel}${
          product.sku ? ` (${product.sku})` : ""
        }.`,
        compare,
        orderDetailsTemplate({ defaultQty: 2 }),
      ]
        .filter(Boolean)
        .join("\n");
    }

    return [
      `*${pending.percent}% off* on ${productLabel}${
        product.sku ? ` (${product.sku})` : ""
      }.`,
      compare,
      orderDetailsTemplate(),
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (!looksLikeOrderDecline(latestUserMessage)) return null;

  if (HARD_STOP_PATTERN.test(latestUserMessage)) {
    return `${MARKER_CLOSED}\nOkay — I won't push. Message anytime if you need help.`;
  }

  const action = nextRecoveryAction(history);
  if (!action) return null;

  if (action === "discount") {
    const compare = priceCompareLine(unitPrice, discount, currency, 1);

    return [
      discountMarker(discount),
      `Special offer: *${discount}% off* ${productLabel}`,
      compare,
      `Reply YES to take it, then:`,
      orderDetailsTemplate(),
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (action === "bundle") {
    const compare = priceCompareLine(unitPrice, bundle, currency, 2);

    return [
      bundleMarker(bundle),
      `Last offer: *2-pack* at *${bundle}% off*`,
      compare,
      `Reply YES, then:`,
      orderDetailsTemplate({ defaultQty: 2 }),
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    MARKER_CLOSED,
    `No problem — thanks for checking ${productLabel}. Message anytime if you need anything.`,
  ].join("\n");
}
