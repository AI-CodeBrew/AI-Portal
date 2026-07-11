import { SALES_SYSTEM_PROMPT } from "./sales-tools";
import { CHAT_HISTORY_LIMIT } from "./chat-history";
import {
  REPLY_LENGTH_OPTIONS,
  type AiReplyLength,
  type ResolvedStoreAiConfig,
} from "./ai-settings-types";
import type { AdProductContext } from "@/lib/ads/types";
import { formatAdContextForPrompt } from "@/lib/ads/whatsapp-ad-links";

const REPLY_LENGTH_INSTRUCTIONS: Record<AiReplyLength, string> = {
  short:
    "Keep every reply to at most 1 short sentence unless a tool result requires a list.",
  medium:
    "Keep replies to about 2–3 short sentences — enough detail without long paragraphs.",
  long: "You may use up to 4–5 sentences when explaining products or order steps.",
};

export function buildSalesSystemPrompt(params: {
  storeLabel: string;
  storeCurrency?: string | null;
  productHint?: string;
  aiConfig?: ResolvedStoreAiConfig | null;
  adProductContext?: AdProductContext | null;
}): string {
  const {
    storeLabel,
    storeCurrency,
    productHint = "",
    aiConfig,
    adProductContext,
  } = params;

  const agentName =
    aiConfig?.agentName?.trim() ||
    storeLabel.replace(/\.myshopify\.com$/i, "") ||
    "Sales Assistant";

  const replyLength = aiConfig?.replyLength ?? "medium";
  const replyInstruction =
    REPLY_LENGTH_INSTRUCTIONS[replyLength] ??
    REPLY_LENGTH_OPTIONS.find((o) => o.value === "medium")!.description;

  const tone = aiConfig?.tone ?? "friendly";
  const toneInstruction = `Use a ${tone} tone in every reply.`;

  const currencyNote = storeCurrency
    ? `\n\nStore currency: ${storeCurrency}. Always quote prices in ${storeCurrency} using price_formatted from tools. Never use dollars unless currency is USD.`
    : "";

  const templateSections: string[] = [];
  if (aiConfig?.generalTemplatePrompt) {
    templateSections.push(
      `General tone template:\n${aiConfig.generalTemplatePrompt}`
    );
  }
  if (aiConfig?.orderTemplatePrompt) {
    templateSections.push(
      `Order creation template:\n${aiConfig.orderTemplatePrompt}`
    );
  }

  const templateBlock = templateSections.length
    ? `\n\n--- Store templates ---\n${templateSections.join("\n\n")}`
    : "";

  const whatsappSales =
    aiConfig?.whatsappSalesPrompt?.trim() ||
    "Follow standard WhatsApp sales flow.";
  const shopifyConfirm =
    aiConfig?.shopifyConfirmPrompt?.trim() ||
    "Help confirm existing Shopify orders.";

  const agentModesBlock = `

--- WhatsApp sales mode ---
${whatsappSales}

--- Shopify confirmation mode ---
${shopifyConfirm}

Mode selection: Use WhatsApp sales mode for WhatsApp leads and new purchases. Use Shopify confirmation mode when the customer is asking about an existing Shopify order (status, address, dispatch, tracking, changes).`;

  const adBlock = adProductContext
    ? `\n\n--- Ad product context ---\n${formatAdContextForPrompt(adProductContext)}`
    : "";

  return `${SALES_SYSTEM_PROMPT}

You are selling for: ${storeLabel}.
Your name is ${agentName}. When introducing yourself, use this name.${currencyNote}${productHint}${adBlock}

Tone: ${toneInstruction}
Reply length: ${replyInstruction}${templateBlock}${agentModesBlock}

You receive the last ${CHAT_HISTORY_LIMIT} messages of this chat (oldest to newest).`;
}
