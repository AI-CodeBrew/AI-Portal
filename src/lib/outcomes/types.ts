export type ObjectionType =
  | "price"
  | "authenticity"
  | "delivery_time"
  | "none"
  | "other";

export type CustomerTone =
  | "direct"
  | "hesitant"
  | "price-sensitive"
  | "enthusiastic";

export type ConversationStageLabel =
  | "greeting"
  | "product_presentation"
  | "qualifying"
  | "objection_handling"
  | "closing"
  | "order_confirmation"
  | "post_order";

export interface ExtractedOutcome {
  objection_type: ObjectionType;
  objection_handling_message: string | null;
  messages_to_close: number;
  stages_observed: ConversationStageLabel[];
  key_closing_line: string;
  customer_tone: CustomerTone;
  what_worked: string;
}

export interface ConversationOutcomeRow {
  id: string;
  conversation_id: string;
  store_id: string;
  closed: boolean;
  objection_type: ObjectionType | null;
  objection_handling_message: string | null;
  messages_to_close: number | null;
  stages_observed: string[] | null;
  key_closing_line: string | null;
  customer_tone: CustomerTone | null;
  what_worked: string | null;
  extracted_at: string;
  order_id: string | null;
}

export interface PromptExampleRow {
  id: string;
  store_id: string;
  conversation_id: string | null;
  outcome_id: string | null;
  transcript_snippet: string;
  objection_type: string | null;
  promoted_at: string;
  active: boolean;
}

export const MAX_ACTIVE_PROMPT_EXAMPLES = 5;

export const EXTRACTION_SYSTEM_PROMPT = `You analyze WhatsApp sales transcripts that ended in a confirmed order.
Return ONLY valid JSON matching this schema — no markdown, no commentary:
{
  "objection_type": "price" | "authenticity" | "delivery_time" | "none" | "other",
  "objection_handling_message": "exact agent message that resolved the objection, or null",
  "messages_to_close": number,
  "stages_observed": ["greeting", "product_presentation", "qualifying", "objection_handling", "closing", "order_confirmation"],
  "key_closing_line": "message that directly asked for or secured the order",
  "customer_tone": "direct" | "hesitant" | "price-sensitive" | "enthusiastic",
  "what_worked": "one sentence on why this conversation likely succeeded"
}`;
