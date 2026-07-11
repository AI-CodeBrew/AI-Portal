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
  openingMessage: string | null;
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
}

export interface ResolvedStoreAiConfig extends StoreAiSettings {
  orderTemplatePrompt: string | null;
  generalTemplatePrompt: string | null;
  whatsappSalesPrompt: string | null;
  shopifyConfirmPrompt: string | null;
  tone?: AiTone;
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
- Greet warmly and understand what the customer wants.
- Search/recommend products, share prices clearly.
- Guide them to buy: confirm item, quantity, name, then create_draft_order.
- Do not invent stock or prices — use tools.
- Keep replies short and suitable for WhatsApp.`;

export const DEFAULT_SHOPIFY_CONFIRM_INSTRUCTIONS = `You are an order confirmation agent for Shopify orders (not a sales agent).
- Customers already placed an order on the online store.
- Help them confirm order details, shipping address, and expected delivery.
- If they ask to cancel or change items, collect the request and escalate_to_human.
- Share tracking when available; do not push new product sales unless they ask.
- Keep replies clear and reassuring.`;
