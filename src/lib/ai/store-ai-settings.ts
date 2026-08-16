import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_GENERAL_TEMPLATE_ID,
  DEFAULT_ORDER_TEMPLATE_ID,
  DEFAULT_SHOPIFY_CONFIRM_INSTRUCTIONS,
  DEFAULT_WHATSAPP_SALES_INSTRUCTIONS,
  clampChatHistoryLimit,
  clampDiscountPercent,
  clampSessionWindowHours,
  UNLIMITED_CONTEXT_VALUE,
  isUnlimitedChatHistory,
  isUnlimitedSessionWindow,
  AI_SETTING_DEFAULTS,
  type AiPromptTemplate,
  type AiReplyLength,
  type AiTemplateCategory,
  type ResolvedStoreAiConfig,
  type StoreAiSettings,
} from "./ai-settings-types";
import { resolveEffectiveAiSettings } from "./platform-defaults";
import { invalidateEffectiveStoreCurrency } from "@/lib/currency";

function mapTemplate(row: Record<string, unknown>): AiPromptTemplate {
  return {
    id: row.id as string,
    store_id: (row.store_id as string | null) ?? null,
    slug: (row.slug as string | null) ?? null,
    category: row.category as AiTemplateCategory,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    prompt_content: row.prompt_content as string,
    created_at: row.created_at as string,
    isPredefined: row.store_id == null,
  };
}

/** Raw store values only (nulls preserved) — for reseller settings UI. */
export async function getStoreAiSettingsRaw(
  storeId: string
): Promise<StoreAiSettings> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("stores")
    .select(
      "ai_agent_name, currency, ai_opening_message, ai_send_opening_message, ai_reply_length, ai_order_template_id, ai_general_template_id, whatsapp_order_template_id, whatsapp_sales_instructions, shopify_confirm_instructions, auto_confirm_orders, auto_follow_up_template_id, ai_chat_history_limit, ai_session_window_hours, ai_recovery_discount_percent, ai_recovery_bundle_discount_percent, ai_conversation_reply_limit, ai_conversation_reply_window_hours"
    )
    .eq("id", storeId)
    .single();

  const numOrNull = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    agentName: (data?.ai_agent_name as string | null) ?? null,
    currency: (data?.currency as string | null) ?? null,
    openingMessage: (data?.ai_opening_message as string | null) ?? null,
    sendOpeningMessage: data?.ai_send_opening_message !== false,
    replyLength: (data?.ai_reply_length as AiReplyLength) ?? "medium",
    orderTemplateId: (data?.ai_order_template_id as string | null) ?? null,
    generalTemplateId: (data?.ai_general_template_id as string | null) ?? null,
    whatsappOrderTemplateId:
      (data?.whatsapp_order_template_id as string | null) ?? null,
    whatsappSalesInstructions:
      (data?.whatsapp_sales_instructions as string | null) ?? null,
    shopifyConfirmInstructions:
      (data?.shopify_confirm_instructions as string | null) ?? null,
    whatsappSalesTemplateId: null,
    shopifyConfirmTemplateId: null,
    autoConfirmOrders: Boolean(data?.auto_confirm_orders),
    autoFollowUpTemplateId:
      (data?.auto_follow_up_template_id as string | null) ?? null,
    chatHistoryLimit: numOrNull(data?.ai_chat_history_limit),
    sessionWindowHours: numOrNull(data?.ai_session_window_hours),
    recoveryDiscountPercent: numOrNull(data?.ai_recovery_discount_percent),
    recoveryBundleDiscountPercent: numOrNull(
      data?.ai_recovery_bundle_discount_percent
    ),
    conversationReplyLimit: numOrNull(data?.ai_conversation_reply_limit),
    conversationReplyWindowHours: numOrNull(
      data?.ai_conversation_reply_window_hours
    ),
  };
}

/** Store settings with template ID fallbacks for the settings form. */
export async function getStoreAiSettings(
  storeId: string
): Promise<StoreAiSettings> {
  const raw = await getStoreAiSettingsRaw(storeId);
  return {
    ...raw,
    orderTemplateId: raw.orderTemplateId ?? DEFAULT_ORDER_TEMPLATE_ID,
    generalTemplateId: raw.generalTemplateId ?? DEFAULT_GENERAL_TEMPLATE_ID,
  };
}

async function loadTemplatePrompt(
  templateId: string | null
): Promise<string | null> {
  if (!templateId) return null;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ai_prompt_templates")
    .select("prompt_content")
    .eq("id", templateId)
    .maybeSingle();

  return (data?.prompt_content as string | null) ?? null;
}

export async function resolveStoreAiConfig(
  storeId: string
): Promise<ResolvedStoreAiConfig> {
  const raw = await getStoreAiSettingsRaw(storeId);
  const settings = await resolveEffectiveAiSettings(raw);
  const [orderTemplatePrompt, generalTemplatePrompt] = await Promise.all([
    loadTemplatePrompt(settings.orderTemplateId),
    loadTemplatePrompt(settings.generalTemplateId),
  ]);

  const whatsappSalesPrompt =
    settings.whatsappSalesInstructions?.trim() ||
    DEFAULT_WHATSAPP_SALES_INSTRUCTIONS;
  const shopifyConfirmPrompt =
    settings.shopifyConfirmInstructions?.trim() ||
    DEFAULT_SHOPIFY_CONFIRM_INSTRUCTIONS;

  return {
    agentName: settings.agentName,
    currency: settings.currency,
    openingMessage: settings.openingMessage,
    sendOpeningMessage: settings.sendOpeningMessage,
    replyLength: settings.replyLength,
    tone: settings.tone,
    orderTemplateId: settings.orderTemplateId,
    generalTemplateId: settings.generalTemplateId,
    whatsappOrderTemplateId: raw.whatsappOrderTemplateId,
    whatsappSalesInstructions: settings.whatsappSalesInstructions,
    shopifyConfirmInstructions: settings.shopifyConfirmInstructions,
    whatsappSalesTemplateId: null,
    shopifyConfirmTemplateId: null,
    autoConfirmOrders: settings.autoConfirmOrders,
    autoFollowUpTemplateId: settings.autoFollowUpTemplateId,
    chatHistoryLimit: raw.chatHistoryLimit,
    sessionWindowHours: raw.sessionWindowHours,
    recoveryDiscountPercent: raw.recoveryDiscountPercent,
    recoveryBundleDiscountPercent: raw.recoveryBundleDiscountPercent,
    conversationReplyLimit: settings.conversationReplyLimit,
    conversationReplyWindowHours: settings.conversationReplyWindowHours,
    effectiveChatHistoryLimit: settings.effectiveChatHistoryLimit,
    effectiveSessionWindowHours: settings.effectiveSessionWindowHours,
    effectiveRecoveryDiscountPercent:
      settings.effectiveRecoveryDiscountPercent,
    effectiveRecoveryBundleDiscountPercent:
      settings.effectiveRecoveryBundleDiscountPercent,
    orderTemplatePrompt,
    generalTemplatePrompt,
    whatsappSalesPrompt,
    shopifyConfirmPrompt,
  };
}

export async function updateStoreAiSettings(
  storeId: string,
  input: Partial<StoreAiSettings>
): Promise<StoreAiSettings | { error: string }> {
  const supabase = createAdminClient();
  const payload: Record<string, string | boolean | number | null> = {};

  if (input.agentName !== undefined) {
    payload.ai_agent_name = input.agentName?.trim() || null;
  }
  if (input.currency !== undefined) {
    payload.currency = input.currency?.trim().toUpperCase() || null;
  }
  if (input.openingMessage !== undefined) {
    payload.ai_opening_message = input.openingMessage?.trim() || null;
  }
  if (input.sendOpeningMessage !== undefined) {
    payload.ai_send_opening_message = Boolean(input.sendOpeningMessage);
  }
  if (input.replyLength !== undefined) {
    payload.ai_reply_length = input.replyLength;
  }
  if (input.orderTemplateId !== undefined) {
    if (input.orderTemplateId) {
      const valid = await templateAccessible(storeId, input.orderTemplateId);
      if (!valid) {
        return { error: "Selected order template is not available" };
      }
    }
    payload.ai_order_template_id = input.orderTemplateId;
  }
  if (input.generalTemplateId !== undefined) {
    if (input.generalTemplateId) {
      const valid = await templateAccessible(storeId, input.generalTemplateId);
      if (!valid) {
        return { error: "Selected general template is not available" };
      }
    }
    payload.ai_general_template_id = input.generalTemplateId;
  }
  if (input.whatsappOrderTemplateId !== undefined) {
    if (input.whatsappOrderTemplateId) {
      const { data: waTpl } = await supabase
        .from("whatsapp_message_templates")
        .select("id, status")
        .eq("id", input.whatsappOrderTemplateId)
        .eq("store_id", storeId)
        .maybeSingle();
      if (!waTpl || waTpl.status !== "approved") {
        return {
          error: "Select a Meta-approved WhatsApp template for order messages",
        };
      }
    }
    payload.whatsapp_order_template_id = input.whatsappOrderTemplateId;
  }
  if (input.whatsappSalesInstructions !== undefined) {
    payload.whatsapp_sales_instructions =
      input.whatsappSalesInstructions?.trim() || null;
  }
  if (input.shopifyConfirmInstructions !== undefined) {
    payload.shopify_confirm_instructions =
      input.shopifyConfirmInstructions?.trim() || null;
  }
  if (input.autoConfirmOrders !== undefined) {
    payload.auto_confirm_orders = Boolean(input.autoConfirmOrders);
  }
  if (input.autoFollowUpTemplateId !== undefined) {
    if (input.autoFollowUpTemplateId) {
      const { data: waTpl } = await supabase
        .from("whatsapp_message_templates")
        .select("id, status")
        .eq("id", input.autoFollowUpTemplateId)
        .eq("store_id", storeId)
        .maybeSingle();
      if (!waTpl || waTpl.status !== "approved") {
        return {
          error: "Select a Meta-approved WhatsApp template for auto follow-up",
        };
      }
    }
    payload.auto_follow_up_template_id = input.autoFollowUpTemplateId;
  }
  if (input.chatHistoryLimit !== undefined) {
    payload.ai_chat_history_limit =
      input.chatHistoryLimit == null
        ? null
        : input.chatHistoryLimit === UNLIMITED_CONTEXT_VALUE
          ? UNLIMITED_CONTEXT_VALUE
          : clampChatHistoryLimit(input.chatHistoryLimit);
  }
  if (input.sessionWindowHours !== undefined) {
    payload.ai_session_window_hours =
      input.sessionWindowHours == null
        ? null
        : input.sessionWindowHours === UNLIMITED_CONTEXT_VALUE
          ? UNLIMITED_CONTEXT_VALUE
          : clampSessionWindowHours(input.sessionWindowHours);
  }
  if (input.recoveryDiscountPercent !== undefined) {
    payload.ai_recovery_discount_percent =
      input.recoveryDiscountPercent == null
        ? null
        : clampDiscountPercent(
            input.recoveryDiscountPercent,
            AI_SETTING_DEFAULTS.recoveryDiscountPercent
          );
  }
  if (input.recoveryBundleDiscountPercent !== undefined) {
    payload.ai_recovery_bundle_discount_percent =
      input.recoveryBundleDiscountPercent == null
        ? null
        : clampDiscountPercent(
            input.recoveryBundleDiscountPercent,
            AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent
          );
  }
  if (input.conversationReplyLimit !== undefined) {
    const n = input.conversationReplyLimit;
    payload.ai_conversation_reply_limit =
      n == null || Number(n) === 0
        ? null
        : Math.min(500, Math.max(1, Math.round(Number(n))));
  }
  if (input.conversationReplyWindowHours !== undefined) {
    const n = input.conversationReplyWindowHours;
    payload.ai_conversation_reply_window_hours =
      n == null || Number(n) === 0
        ? null
        : Math.min(168, Math.max(1, Math.round(Number(n))));
  }

  const { error } = await supabase
    .from("stores")
    .update(payload)
    .eq("id", storeId);

  if (error) {
    const hint =
      error.message.includes("ai_agent_name") ||
      error.message.includes("whatsapp_sales_instructions") ||
      error.message.includes("auto_confirm_orders") ||
      error.message.includes("ai_chat_history_limit") ||
      error.message.includes("ai_recovery") ||
      error.message.includes("ai_send_opening_message")
        ? " — Run migrations 009 / 020 / 026 / 035 in Supabase"
        : error.message.includes("currency")
          ? " — Run migration 041_store_currency.sql in Supabase"
          : "";
    return { error: error.message + hint };
  }

  invalidateEffectiveStoreCurrency(storeId);
  return getStoreAiSettings(storeId);
}

async function templateAccessible(
  storeId: string,
  templateId: string
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ai_prompt_templates")
    .select("id, store_id")
    .eq("id", templateId)
    .maybeSingle();

  if (!data) return false;
  return data.store_id == null || data.store_id === storeId;
}

export async function listAiTemplates(
  storeId: string,
  category?: AiTemplateCategory
): Promise<AiPromptTemplate[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from("ai_prompt_templates")
    .select("*")
    .or(`store_id.is.null,store_id.eq.${storeId}`)
    .order("store_id", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[ai-settings] list templates:", error.message);
    return [];
  }

  return (data ?? []).map(mapTemplate);
}

export async function createStoreAiTemplate(
  storeId: string,
  input: {
    name: string;
    description?: string | null;
    category: AiTemplateCategory;
    promptContent: string;
  }
): Promise<AiPromptTemplate | { error: string }> {
  const name = input.name.trim();
  const promptContent = input.promptContent.trim();

  if (!name) return { error: "Template name is required" };
  if (!promptContent) return { error: "Template instructions are required" };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ai_prompt_templates")
    .insert({
      store_id: storeId,
      category: input.category,
      name,
      description: input.description?.trim() || null,
      prompt_content: promptContent,
    })
    .select("*")
    .single();

  if (error) {
    const hint = error.message.includes("ai_prompt_templates")
      ? " — Run migration 009_ai_settings.sql in Supabase"
      : "";
    return { error: error.message + hint };
  }

  return mapTemplate(data);
}

export async function updateStoreAiTemplate(
  storeId: string,
  templateId: string,
  input: {
    name?: string;
    description?: string | null;
    category?: AiTemplateCategory;
    promptContent?: string;
  }
): Promise<AiPromptTemplate | { error: string }> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("ai_prompt_templates")
    .select("store_id")
    .eq("id", templateId)
    .maybeSingle();

  if (!existing || existing.store_id !== storeId) {
    return { error: "Template not found or cannot be edited" };
  }

  const payload: Record<string, string | null> = {};
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.description !== undefined) {
    payload.description = input.description?.trim() || null;
  }
  if (input.category !== undefined) payload.category = input.category;
  if (input.promptContent !== undefined) {
    payload.prompt_content = input.promptContent.trim();
  }

  const { data, error } = await supabase
    .from("ai_prompt_templates")
    .update(payload)
    .eq("id", templateId)
    .select("*")
    .single();

  if (error) return { error: error.message };
  return mapTemplate(data);
}

export async function deleteStoreAiTemplate(
  storeId: string,
  templateId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("ai_prompt_templates")
    .select("store_id")
    .eq("id", templateId)
    .maybeSingle();

  if (!existing || existing.store_id !== storeId) {
    return { error: "Template not found or cannot be deleted" };
  }

  const { count } = await supabase
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("ai_order_template_id", templateId);

  if ((count ?? 0) > 0) {
    await supabase
      .from("stores")
      .update({ ai_order_template_id: DEFAULT_ORDER_TEMPLATE_ID })
      .eq("id", storeId);
  }

  const { error } = await supabase
    .from("ai_prompt_templates")
    .delete()
    .eq("id", templateId);

  if (error) return { error: error.message };
  return { ok: true };
}

export function personalizeOpeningMessage(
  template: string,
  vars: { agentName: string; storeName: string }
): string {
  return template
    .replace(/\{\{brand\}\}/gi, vars.storeName)
    .replace(/\{agent_name\}/gi, vars.agentName)
    .replace(/\{store_name\}/gi, vars.storeName);
}
