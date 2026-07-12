import { createAdminClient } from "@/lib/supabase/admin";
import {
  AI_SETTING_DEFAULTS,
  DEFAULT_GENERAL_TEMPLATE_ID,
  DEFAULT_ORDER_TEMPLATE_ID,
  clampChatHistoryLimit,
  clampDiscountPercent,
  clampSessionWindowHours,
  type AiReplyLength,
  type AiTone,
  type StoreAiSettings,
} from "@/lib/ai/ai-settings-types";

export type PlatformBranding = {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
};

export type PlatformAiDefaults = StoreAiSettings &
  PlatformBranding & {
    tone: AiTone;
    updatedAt: string | null;
  };

export type PlatformAiDefaultsInput = {
  agentName?: string | null;
  openingMessage?: string | null;
  replyLength?: AiReplyLength;
  tone?: AiTone;
  platformName?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  chatHistoryLimit?: number | null;
  sessionWindowHours?: number | null;
  recoveryDiscountPercent?: number | null;
  recoveryBundleDiscountPercent?: number | null;
  conversationReplyLimit?: number | null;
  conversationReplyWindowHours?: number | null;
};

const FALLBACK_OPENING =
  "Hi! Welcome to {{brand}} 👋 How can I help?";

const FALLBACK_BRANDING: PlatformBranding = {
  platformName: "Arabia AI",
  supportEmail: "support@arabia-ai.com",
  supportPhone: "+971 4 555 0100",
};

function isTone(value: unknown): value is AiTone {
  return (
    value === "friendly" ||
    value === "professional" ||
    value === "casual" ||
    value === "formal"
  );
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const PLATFORM_SELECT =
  "ai_agent_name, ai_opening_message, ai_reply_length, ai_tone, ai_order_template_id, ai_general_template_id, platform_name, support_email, support_phone, updated_at, ai_chat_history_limit, ai_session_window_hours, ai_recovery_discount_percent, ai_recovery_bundle_discount_percent, ai_conversation_reply_limit, ai_conversation_reply_window_hours";

function emptyExtraSettings(): Pick<
  StoreAiSettings,
  | "whatsappOrderTemplateId"
  | "whatsappSalesInstructions"
  | "shopifyConfirmInstructions"
  | "whatsappSalesTemplateId"
  | "shopifyConfirmTemplateId"
  | "autoConfirmOrders"
  | "autoFollowUpTemplateId"
> {
  return {
    whatsappOrderTemplateId: null,
    whatsappSalesInstructions: null,
    shopifyConfirmInstructions: null,
    whatsappSalesTemplateId: null,
    shopifyConfirmTemplateId: null,
    autoConfirmOrders: false,
    autoFollowUpTemplateId: null,
  };
}

export async function getPlatformAiDefaults(): Promise<PlatformAiDefaults> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("platform_ai_defaults")
    .select(PLATFORM_SELECT)
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return {
      agentName: "Max",
      openingMessage: FALLBACK_OPENING,
      replyLength: "medium",
      tone: "friendly",
      orderTemplateId: DEFAULT_ORDER_TEMPLATE_ID,
      generalTemplateId: DEFAULT_GENERAL_TEMPLATE_ID,
      ...emptyExtraSettings(),
      chatHistoryLimit: AI_SETTING_DEFAULTS.chatHistoryLimit,
      sessionWindowHours: AI_SETTING_DEFAULTS.sessionWindowHours,
      recoveryDiscountPercent: AI_SETTING_DEFAULTS.recoveryDiscountPercent,
      recoveryBundleDiscountPercent:
        AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent,
      conversationReplyLimit: null,
      conversationReplyWindowHours: null,
      ...FALLBACK_BRANDING,
      updatedAt: null,
    };
  }

  return {
    agentName: (data.ai_agent_name as string | null) ?? "Max",
    openingMessage:
      (data.ai_opening_message as string | null) ?? FALLBACK_OPENING,
    replyLength: (data.ai_reply_length as AiReplyLength) ?? "medium",
    tone: isTone(data.ai_tone) ? data.ai_tone : "friendly",
    orderTemplateId:
      (data.ai_order_template_id as string | null) ?? DEFAULT_ORDER_TEMPLATE_ID,
    generalTemplateId:
      (data.ai_general_template_id as string | null) ??
      DEFAULT_GENERAL_TEMPLATE_ID,
    ...emptyExtraSettings(),
    chatHistoryLimit:
      numOrNull(data.ai_chat_history_limit) ??
      AI_SETTING_DEFAULTS.chatHistoryLimit,
    sessionWindowHours:
      numOrNull(data.ai_session_window_hours) ??
      AI_SETTING_DEFAULTS.sessionWindowHours,
    recoveryDiscountPercent:
      numOrNull(data.ai_recovery_discount_percent) ??
      AI_SETTING_DEFAULTS.recoveryDiscountPercent,
    recoveryBundleDiscountPercent:
      numOrNull(data.ai_recovery_bundle_discount_percent) ??
      AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent,
    conversationReplyLimit: numOrNull(data.ai_conversation_reply_limit),
    conversationReplyWindowHours: numOrNull(
      data.ai_conversation_reply_window_hours
    ),
    platformName:
      (data.platform_name as string | null)?.trim() ||
      FALLBACK_BRANDING.platformName,
    supportEmail:
      (data.support_email as string | null)?.trim() ||
      FALLBACK_BRANDING.supportEmail,
    supportPhone:
      (data.support_phone as string | null)?.trim() ||
      FALLBACK_BRANDING.supportPhone,
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}

export async function updatePlatformAiDefaults(
  input: PlatformAiDefaultsInput
): Promise<PlatformAiDefaults | { error: string }> {
  const supabase = createAdminClient();
  const payload: Record<string, string | number | null> = {
    updated_at: new Date().toISOString(),
  };

  if (input.agentName !== undefined) {
    payload.ai_agent_name = input.agentName?.trim() || null;
  }
  if (input.openingMessage !== undefined) {
    payload.ai_opening_message = input.openingMessage?.trim() || null;
  }
  if (input.replyLength !== undefined) {
    payload.ai_reply_length = input.replyLength;
  }
  if (input.tone !== undefined) {
    payload.ai_tone = input.tone;
  }
  if (input.platformName !== undefined) {
    payload.platform_name = input.platformName?.trim() || null;
  }
  if (input.supportEmail !== undefined) {
    payload.support_email = input.supportEmail?.trim() || null;
  }
  if (input.supportPhone !== undefined) {
    payload.support_phone = input.supportPhone?.trim() || null;
  }
  if (input.chatHistoryLimit !== undefined) {
    payload.ai_chat_history_limit =
      input.chatHistoryLimit == null
        ? AI_SETTING_DEFAULTS.chatHistoryLimit
        : clampChatHistoryLimit(input.chatHistoryLimit);
  }
  if (input.sessionWindowHours !== undefined) {
    payload.ai_session_window_hours =
      input.sessionWindowHours == null
        ? AI_SETTING_DEFAULTS.sessionWindowHours
        : clampSessionWindowHours(input.sessionWindowHours);
  }
  if (input.recoveryDiscountPercent !== undefined) {
    payload.ai_recovery_discount_percent =
      input.recoveryDiscountPercent == null
        ? AI_SETTING_DEFAULTS.recoveryDiscountPercent
        : clampDiscountPercent(
            input.recoveryDiscountPercent,
            AI_SETTING_DEFAULTS.recoveryDiscountPercent
          );
  }
  if (input.recoveryBundleDiscountPercent !== undefined) {
    payload.ai_recovery_bundle_discount_percent =
      input.recoveryBundleDiscountPercent == null
        ? AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent
        : clampDiscountPercent(
            input.recoveryBundleDiscountPercent,
            AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent
          );
  }
  if (input.conversationReplyLimit !== undefined) {
    const n = input.conversationReplyLimit;
    payload.ai_conversation_reply_limit =
      n == null || n === 0
        ? null
        : Math.min(500, Math.max(1, Math.round(n)));
  }
  if (input.conversationReplyWindowHours !== undefined) {
    const n = input.conversationReplyWindowHours;
    payload.ai_conversation_reply_window_hours =
      n == null || n === 0
        ? null
        : Math.min(168, Math.max(1, Math.round(n)));
  }

  const { error } = await supabase
    .from("platform_ai_defaults")
    .upsert({ id: 1, ...payload }, { onConflict: "id" });

  if (error) {
    const hint =
      error.message.includes("platform_ai_defaults") ||
      error.message.includes("ai_chat_history_limit") ||
      error.message.includes("ai_recovery")
        ? " — Run migration 026_ai_context_and_recovery_settings.sql in Supabase"
        : "";
    return { error: error.message + hint };
  }

  return getPlatformAiDefaults();
}

/** Merge store overrides with platform defaults (store wins when set). */
export async function resolveEffectiveAiSettings(storeSettings: {
  agentName: string | null;
  openingMessage: string | null;
  replyLength: AiReplyLength | null;
  orderTemplateId: string | null;
  generalTemplateId: string | null;
  whatsappOrderTemplateId?: string | null;
  whatsappSalesInstructions?: string | null;
  shopifyConfirmInstructions?: string | null;
  autoConfirmOrders?: boolean;
  autoFollowUpTemplateId?: string | null;
  chatHistoryLimit?: number | null;
  sessionWindowHours?: number | null;
  recoveryDiscountPercent?: number | null;
  recoveryBundleDiscountPercent?: number | null;
  conversationReplyLimit?: number | null;
  conversationReplyWindowHours?: number | null;
}): Promise<
  StoreAiSettings & {
    usingPlatformDefaults: boolean;
    tone: AiTone;
    effectiveChatHistoryLimit: number;
    effectiveSessionWindowHours: number;
    effectiveRecoveryDiscountPercent: number;
    effectiveRecoveryBundleDiscountPercent: number;
  }
> {
  const platform = await getPlatformAiDefaults();

  const agentName = storeSettings.agentName?.trim() || platform.agentName;
  const openingMessage =
    storeSettings.openingMessage?.trim() || platform.openingMessage;
  const replyLength = storeSettings.replyLength ?? platform.replyLength;
  const orderTemplateId =
    storeSettings.orderTemplateId ||
    platform.orderTemplateId ||
    DEFAULT_ORDER_TEMPLATE_ID;
  const generalTemplateId =
    storeSettings.generalTemplateId ||
    platform.generalTemplateId ||
    DEFAULT_GENERAL_TEMPLATE_ID;

  const usingPlatformDefaults =
    !storeSettings.agentName?.trim() || !storeSettings.openingMessage?.trim();

  const effectiveChatHistoryLimit = clampChatHistoryLimit(
    storeSettings.chatHistoryLimit ?? platform.chatHistoryLimit
  );
  const effectiveSessionWindowHours = clampSessionWindowHours(
    storeSettings.sessionWindowHours ?? platform.sessionWindowHours
  );
  const effectiveRecoveryDiscountPercent = clampDiscountPercent(
    storeSettings.recoveryDiscountPercent ?? platform.recoveryDiscountPercent,
    AI_SETTING_DEFAULTS.recoveryDiscountPercent
  );
  const effectiveRecoveryBundleDiscountPercent = clampDiscountPercent(
    storeSettings.recoveryBundleDiscountPercent ??
      platform.recoveryBundleDiscountPercent,
    AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent
  );

  return {
    agentName,
    openingMessage,
    replyLength,
    tone: platform.tone,
    orderTemplateId,
    generalTemplateId,
    whatsappOrderTemplateId: storeSettings.whatsappOrderTemplateId ?? null,
    whatsappSalesInstructions:
      storeSettings.whatsappSalesInstructions?.trim() || null,
    shopifyConfirmInstructions:
      storeSettings.shopifyConfirmInstructions?.trim() || null,
    whatsappSalesTemplateId: null,
    shopifyConfirmTemplateId: null,
    autoConfirmOrders: Boolean(storeSettings.autoConfirmOrders),
    autoFollowUpTemplateId: storeSettings.autoFollowUpTemplateId ?? null,
    chatHistoryLimit: storeSettings.chatHistoryLimit ?? null,
    sessionWindowHours: storeSettings.sessionWindowHours ?? null,
    recoveryDiscountPercent: storeSettings.recoveryDiscountPercent ?? null,
    recoveryBundleDiscountPercent:
      storeSettings.recoveryBundleDiscountPercent ?? null,
    conversationReplyLimit:
      storeSettings.conversationReplyLimit ??
      platform.conversationReplyLimit ??
      null,
    conversationReplyWindowHours:
      storeSettings.conversationReplyWindowHours ??
      platform.conversationReplyWindowHours ??
      null,
    effectiveChatHistoryLimit,
    effectiveSessionWindowHours,
    effectiveRecoveryDiscountPercent,
    effectiveRecoveryBundleDiscountPercent,
    usingPlatformDefaults,
  };
}
