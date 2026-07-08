export type AiReplyLength = "short" | "medium" | "long";

export type AiTemplateCategory =
  | "order_creation"
  | "general"
  | "product_inquiry"
  | "support";

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
}

export interface ResolvedStoreAiConfig extends StoreAiSettings {
  orderTemplatePrompt: string | null;
  generalTemplatePrompt: string | null;
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

export const TEMPLATE_CATEGORY_LABELS: Record<AiTemplateCategory, string> = {
  order_creation: "Order creation",
  general: "General tone",
  product_inquiry: "Product inquiry",
  support: "Support & escalation",
};

export const DEFAULT_ORDER_TEMPLATE_ID =
  "a1000001-0001-4000-8000-000000000001";

export const DEFAULT_GENERAL_TEMPLATE_ID =
  "a1000001-0001-4000-8000-000000000005";
