export type AiReplyLength = "short" | "medium" | "long";

export type AiTone = "friendly" | "professional" | "casual" | "formal";

export type AiTemplateCategory =
  | "order_creation"
  | "general"
  | "product_inquiry"
  | "support"
  | "whatsapp_sales"
  | "shopify_confirmation";

export interface AiPromptTemplate {
  id: string;
  store_id: string | null;
  slug: string | null;
  category: AiTemplateCategory;
  name: string;
  description: string | null;
  prompt_content: string;
  created_at: string;
  isPredefined: boolean;
}

export interface StoreAiSettings {
  agentName: string | null;
  /** Store-wide currency code (e.g. PKR, AED, USD) — authoritative for portal
   * and Shopify products alike. Null = fall back to the connected Shopify
   * shop's currency, then PKR. */
  currency: string | null;
  openingMessage: string | null;
  /** When false, no opening message is sent (admin default is ignored). */
  sendOpeningMessage: boolean;
  replyLength: AiReplyLength;
  orderTemplateId: string | null;
  generalTemplateId: string | null;
  /** Meta-approved WhatsApp template for order confirmation sends */
  whatsappOrderTemplateId: string | null;
  /** Free-text / preset instructions for WhatsApp lead sales */
  whatsappSalesInstructions: string | null;
  /** Free-text / preset instructions for Shopify confirmation chats */
  shopifyConfirmInstructions: string | null;
  whatsappSalesTemplateId: string | null;
  shopifyConfirmTemplateId: string | null;
  autoConfirmOrders: boolean;
  autoFollowUpTemplateId: string | null;
  /** Last N messages AI remembers (null = use platform default) */
  chatHistoryLimit: number | null;
  /** Hours until AI session resets (null = use platform default) */
  sessionWindowHours: number | null;
  /** First "no" discount % (null = use platform default) */
  recoveryDiscountPercent: number | null;
  /** Bundle (2-pack) discount % (null = use platform default) */
  recoveryBundleDiscountPercent: number | null;
  /** Max AI replies per chat before human handoff (null = unlimited / platform) */
  conversationReplyLimit: number | null;
  /** Spam window hours (null = whole chat / platform) */
  conversationReplyWindowHours: number | null;
}

export interface ResolvedStoreAiConfig extends StoreAiSettings {
  orderTemplatePrompt: string | null;
  generalTemplatePrompt: string | null;
  whatsappSalesPrompt: string | null;
  shopifyConfirmPrompt: string | null;
  tone?: AiTone;
  /** Resolved effective values used at runtime */
  effectiveChatHistoryLimit: number;
  effectiveSessionWindowHours: number;
  effectiveRecoveryDiscountPercent: number;
  effectiveRecoveryBundleDiscountPercent: number;
}

export const AI_SETTING_DEFAULTS = {
  /** Last N verbatim messages for the AI (no time cut by default). */
  chatHistoryLimit: 20,
  /** 0 = no session time window — older context kept via rolling summary. */
  sessionWindowHours: 0,
  recoveryDiscountPercent: 15,
  recoveryBundleDiscountPercent: 25,
} as const;

/** Stored in DB as 0 — full thread context (no message cap / no session reset). */
export const UNLIMITED_CONTEXT_VALUE = 0;

export const MAX_UNLIMITED_HISTORY_MESSAGES = 500;

export function isUnlimitedChatHistory(limit: number | null | undefined): boolean {
  return limit === UNLIMITED_CONTEXT_VALUE;
}

export function isUnlimitedSessionWindow(hours: number | null | undefined): boolean {
  return hours === UNLIMITED_CONTEXT_VALUE;
}

export function clampChatHistoryLimit(n: number | null | undefined): number {
  if (n === UNLIMITED_CONTEXT_VALUE) return UNLIMITED_CONTEXT_VALUE;
  if (n == null || !Number.isFinite(n)) return AI_SETTING_DEFAULTS.chatHistoryLimit;
  return Math.min(50, Math.max(5, Math.round(n)));
}

export function clampSessionWindowHours(n: number | null | undefined): number {
  if (n === UNLIMITED_CONTEXT_VALUE) return UNLIMITED_CONTEXT_VALUE;
  if (n == null || !Number.isFinite(n)) return AI_SETTING_DEFAULTS.sessionWindowHours;
  return Math.min(168, Math.max(1, Math.round(n)));
}

export function clampDiscountPercent(n: number | null | undefined, fallback: number): number {
  if (n == null || !Number.isFinite(n)) return fallback;
  return Math.min(90, Math.max(1, Math.round(n)));
}

export const REPLY_LENGTH_OPTIONS: Array<{
  value: AiReplyLength;
  label: string;
  description: string;
}> = [
  {
    value: "short",
    label: "Short — 1 sentence",
    description: "Brief replies, ideal for quick chats",
  },
  {
    value: "medium",
    label: "Medium — 2–3 sentences (recommended)",
    description: "Balanced detail for most stores",
  },
  {
    value: "long",
    label: "Long — up to 4–5 sentences",
    description: "More detail when customers need explanation",
  },
];

export const TONE_OPTIONS: Array<{ value: AiTone; label: string }> = [
  { value: "friendly", label: "Friendly" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
];

export const TEMPLATE_CATEGORY_LABELS: Record<AiTemplateCategory, string> = {
  order_creation: "Order creation",
  general: "General tone",
  product_inquiry: "Product inquiry",
  support: "Support & escalation",
  whatsapp_sales: "WhatsApp sales agent",
  shopify_confirmation: "Shopify confirmation agent",
};

export const DEFAULT_ORDER_TEMPLATE_ID =
  "a1000001-0001-4000-8000-000000000001";

export const DEFAULT_GENERAL_TEMPLATE_ID =
  "a1000001-0001-4000-8000-000000000005";

export const DEFAULT_WHATSAPP_SALES_TEMPLATE_ID =
  "a1000001-0001-4000-8000-000000000011";

export const DEFAULT_SHOPIFY_CONFIRM_TEMPLATE_ID =
  "a1000001-0001-4000-8000-000000000013";

export const DEFAULT_WHATSAPP_SALES_INSTRUCTIONS = `You are a WhatsApp sales agent for this store.
- Greet warmly and understand what the customer wants (they may message directly on WhatsApp with no prior context).
- Search BOTH portal products and Shopify products (search_products). When they give a SKU/ref, search that SKU and share full details (name, price, stock, description, variants).
- If the customer refers to "my last product", "previous product", "that product", "same product", "the one I just mentioned", etc., do not search the catalog using those words as the product name. Instead, use the most recently identified product from the conversation context. If a quantity is provided, extract it separately and apply it to that product.
- Do not invent stock or prices — use tools.
- Whenever they ask about a product, after sharing details try to close the deal: ask if they want to buy, then collect:
  1) Full name
  2) Phone number (confirm the WhatsApp number or ask if different)
  3) Full delivery address (house/street, area/city, and postal code if available)
- If they say they don't want to order / not interested / too expensive — recover step by step (one reply per step):
  1) Reassure on quality and value — explain why it's worth the price. Do NOT offer a discount on the first refusal.
  2) If they still refuse, offer the configured first-refusal discount % (show discounted price). If they accept, collect details + quantity and create_draft_order with that discount_percent.
  3) If they still refuse, offer a 2-pack bundle at the configured bundle discount %. If they accept, create_draft_order with qty and that discount.
  4) If they refuse again, thank them and stop pushing.
- Always calculate totals as unit price × quantity × (1 − discount%/100).
- Use the last 20 chat messages plus conversation summary for context (sizes, "that one", follow-ups).
- Never call create_draft_order until phone + full delivery address are confirmed (name is optional). If the phone is missing, incomplete, or invalid, ask them to send the correct full number.
- After create_draft_order succeeds, tell them the order is confirmed and share brief dispatching details (processing / expected delivery window).
- Keep replies short and suitable for WhatsApp.`;

export const DEFAULT_SHOPIFY_CONFIRM_INSTRUCTIONS = `You are the Shopify order confirmation agent (customers already ordered on the online store).
- When they have a pending Shopify order, ask them clearly to CONFIRM or CANCEL the order. Summarize items and total.
- If they CONFIRM: call confirm_order, then send a warm confirmation plus dispatching details (order is being prepared / typical delivery window). Do not invent tracking numbers.
- If they CANCEL: do NOT end the chat. Call cancel_order, then try to recover the sale:
  1) Offer the same product again at 15% discount (mention the discounted price clearly). If they accept, collect/confirm address if needed and create_draft_order with discount_percent 15.
  2) If they still refuse, offer a bundle pack of 2 units with a better deal (suggest about 20–25% off the 2-unit total). If they accept, create_draft_order for qty 2 with that discount_percent.
  3) If they still decline, thank them politely and stop pushing.
- Keep replies clear, reassuring, and short for WhatsApp.`;
