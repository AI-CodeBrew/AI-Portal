import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_GENERAL_TEMPLATE_ID,
  DEFAULT_ORDER_TEMPLATE_ID,
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

export async function getPlatformAiDefaults(): Promise<PlatformAiDefaults> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("platform_ai_defaults")
    .select(
      "ai_agent_name, ai_opening_message, ai_reply_length, ai_tone, ai_order_template_id, ai_general_template_id, platform_name, support_email, support_phone, updated_at"
    )
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
      whatsappOrderTemplateId: null,
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
    whatsappOrderTemplateId: null,
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
  const payload: Record<string, string | null> = {
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

  const { error } = await supabase
    .from("platform_ai_defaults")
    .upsert({ id: 1, ...payload }, { onConflict: "id" });

  if (error) {
    const hint =
      error.message.includes("platform_ai_defaults") ||
      error.message.includes("ai_tone") ||
      error.message.includes("platform_name")
        ? " — Run migration 017_platform_ai_branding.sql in Supabase"
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
}): Promise<
  StoreAiSettings & { usingPlatformDefaults: boolean; tone: AiTone }
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

  return {
    agentName,
    openingMessage,
    replyLength,
    tone: platform.tone,
    orderTemplateId,
    generalTemplateId,
    whatsappOrderTemplateId: null,
    usingPlatformDefaults,
  };
}
