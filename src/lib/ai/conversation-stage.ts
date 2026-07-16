import type { AdProductContext } from "@/lib/ads/types";
import { extractSkuFromText } from "@/lib/products/products-service";
import { parseCheckoutDetails } from "./checkout-parse";

export type ConversationStage =
  | "greeting"
  | "product_presentation"
  | "qualifying"
  | "objection_handling"
  | "closing"
  | "order_confirmation"
  | "post_order";

export type StructuredConversationSummary = {
  customer_name?: string | null;
  city?: string | null;
  variant?: string | null;
  quantity?: number | null;
  sku?: string | null;
  product_title?: string | null;
  quoted_price?: string | null;
};

const STAGE_INSTRUCTIONS: Record<ConversationStage, string> = {
  greeting:
    "Customer just opened the chat or landed from an ad. Greet warmly like a real rep. If ad SKU is known, say you're pulling up that product and call search_products with that SKU or name. One short message — don't info-dump.",
  product_presentation:
    "Share name and price from tool data only. Mention stock briefly. Ask ONE qualifying question (size/color/variant) if options exist — don't paste the full spec sheet.",
  qualifying:
    "Get delivery city, quantity, and variant if missing. Ask one question at a time. Don't re-pitch the whole product.",
  objection_handling:
    "Customer pushed back on price or interest. First reassure on quality/value — do NOT jump straight to a discount (recovery handler does this automatically). Only after they decline again should discount/bundle offers apply.",
  closing:
    "Customer is ready or you have enough details. Ask directly for delivery address (and name/phone if still missing). Don't re-explain the product.",
  order_confirmation:
    "Order was placed or is being confirmed. Share order number and realistic delivery expectations from tool data only. Be warm and brief.",
  post_order:
    "Answer follow-up questions about their order. No more selling unless they ask for another product.",
};

type HistoryMessage = { role: "user" | "assistant"; content: string };

function assistantText(history: HistoryMessage[], n = 6): string {
  return history
    .filter((m) => m.role === "assistant")
    .slice(-n)
    .map((m) => m.content)
    .join("\n");
}

function userText(history: HistoryMessage[], n = 4): string {
  return history
    .filter((m) => m.role === "user")
    .slice(-n)
    .map((m) => m.content)
    .join("\n");
}

function productWasPresented(history: HistoryMessage[]): boolean {
  return /\b(price:|sku:|in stock|available|variants?)\b/i.test(
    assistantText(history, 8)
  );
}

export function detectConversationStage(
  history: HistoryMessage[],
  options?: { adProductContext?: AdProductContext | null }
): ConversationStage {
  const recentAssistant = assistantText(history, 3);
  const recentUser = userText(history, 2);
  const allAssistant = assistantText(history, 10);

  if (
    /\b(order confirmed|order placed|order is confirmed|confirmed your order|order #|order number)\b/i.test(
      recentAssistant
    )
  ) {
    if (
      /\b(tracking|where is|when will|delivery status|follow up)\b/i.test(
        recentUser
      )
    ) {
      return "post_order";
    }
    return "order_confirmation";
  }

  if (
    /\b(share your|full name|delivery address|phone \(for|reply like this|send me your address|where should we deliver)\b/i.test(
      assistantText(history, 4)
    )
  ) {
    return "closing";
  }

  if (
    /\b(too expensive|don'?t want|not interested|no thanks|maybe later|too much|can'?t afford)\b/i.test(
      recentUser
    )
  ) {
    return "objection_handling";
  }

  if (
    productWasPresented(history) &&
    /\b(size|color|colour|variant|quantity|qty|how many|which one|city|area|deliver to)\b/i.test(
      `${recentUser}\n${recentAssistant}`
    )
  ) {
    return "qualifying";
  }

  if (productWasPresented(history)) {
    return "product_presentation";
  }

  if (
    history.length <= 2 ||
    options?.adProductContext ||
    /^(hi|hello|hey|salam|assalam|good morning|good evening)\b/i.test(
      recentUser.trim()
    )
  ) {
    return "greeting";
  }

  if (/\b(order|buy|want this|i'll take|place order)\b/i.test(recentUser)) {
    return "closing";
  }

  return options?.adProductContext ? "greeting" : "product_presentation";
}

export function getStageInstructions(stage: ConversationStage): string {
  return STAGE_INSTRUCTIONS[stage];
}

export function buildStructuredSummary(
  history: HistoryMessage[],
  options?: { adProductContext?: AdProductContext | null }
): StructuredConversationSummary {
  const summary: StructuredConversationSummary = {};

  if (options?.adProductContext?.sku) {
    summary.sku = options.adProductContext.sku;
  }
  if (options?.adProductContext?.productTitle) {
    summary.product_title = options.adProductContext.productTitle;
  }
  if (options?.adProductContext?.price) {
    summary.quoted_price = options.adProductContext.price;
  }
  if (options?.adProductContext?.variantTitle) {
    summary.variant = options.adProductContext.variantTitle;
  }

  for (const msg of history.filter((m) => m.role === "user").slice(-4)) {
    const parsed = parseCheckoutDetails(msg.content);
    if (parsed?.customer_name && !summary.customer_name) {
      summary.customer_name = parsed.customer_name;
    }
    if (parsed?.city && !summary.city) {
      summary.city = parsed.city;
    }
  }

  for (const msg of history) {
    const sku = extractSkuFromText(msg.content);
    if (sku && !summary.sku) summary.sku = sku;

    const titleMatch = msg.content.match(/\*([^*]+)\*/);
    if (titleMatch?.[1] && !summary.product_title) {
      summary.product_title = titleMatch[1].trim();
    }

    const priceMatch = msg.content.match(
      /\b(?:price|from|now|was)[:\s]*([^\n]{2,40})/i
    );
    if (priceMatch?.[1] && !summary.quoted_price) {
      summary.quoted_price = priceMatch[1].trim();
    }

    const qtyMatch = msg.content.match(/\b(?:qty|quantity)[:\s]*(\d+)/i);
    if (qtyMatch?.[1] && !summary.quantity) {
      summary.quantity = Number(qtyMatch[1]);
    }
  }

  return summary;
}

export function formatStructuredSummary(
  summary: StructuredConversationSummary
): string {
  const parts: string[] = [];
  if (summary.customer_name) parts.push(`name: ${summary.customer_name}`);
  if (summary.city) parts.push(`city: ${summary.city}`);
  if (summary.variant) parts.push(`variant: ${summary.variant}`);
  if (summary.quantity != null) parts.push(`qty: ${summary.quantity}`);
  if (summary.sku) parts.push(`sku: ${summary.sku}`);
  if (summary.product_title) parts.push(`product: ${summary.product_title}`);
  if (summary.quoted_price) parts.push(`quoted_price: ${summary.quoted_price}`);
  return parts.length ? `{ ${parts.join(", ")} }` : "{ none yet }";
}
