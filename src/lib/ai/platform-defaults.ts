import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_GENERAL_TEMPLATE_ID,
  DEFAULT_ORDER_TEMPLATE_ID,
  type AiReplyLength,
  type StoreAiSettings,
} from "@/lib/ai/ai-settings-types";

export type PlatformAiDefaults = StoreAiSettings & {
  updatedAt: string | null;
};

const FALLBACK_OPENING =
  "Hi! Welcome to {store_name} 👋 I'm {agent_name}. How can I help you today?";

export async function getPlatformAiDefaults(): Promise<PlatformAiDefaults> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("platform_ai_defaults")
    .select(
      "ai_agent_name, ai_opening_message, ai_reply_length, ai_order_template_id, ai_general_template_id, updated_at"
    )
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return {
      agentName: "Sales Assistant",
      openingMessage: FALLBACK_OPENING,
      replyLength: "medium",
      orderTemplateId: DEFAULT_ORDER_TEMPLATE_ID,
      generalTemplateId: DEFAULT_GENERAL_TEMPLATE_ID,
      updatedAt: null,
    };
  }

  return {
    agentName: (data.ai_agent_name as string | null) ?? "Sales Assistant",
    openingMessage:
      (data.ai_opening_message as string | null) ?? FALLBACK_OPENING,
    replyLength: (data.ai_reply_length as AiReplyLength) ?? "medium",
    orderTemplateId:
      (data.ai_order_template_id as string | null) ?? DEFAULT_ORDER_TEMPLATE_ID,
    generalTemplateId:
      (data.ai_general_template_id as string | null) ??
      DEFAULT_GENERAL_TEMPLATE_ID,
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}

export async function updatePlatformAiDefaults(
  input: Partial<StoreAiSettings>
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
  if (input.orderTemplateId !== undefined) {
    payload.ai_order_template_id = input.orderTemplateId;
  }
  if (input.generalTemplateId !== undefined) {
    payload.ai_general_template_id = input.generalTemplateId;
  }

  const { error } = await supabase
    .from("platform_ai_defaults")
    .upsert({ id: 1, ...payload }, { onConflict: "id" });

  if (error) {
    const hint = error.message.includes("platform_ai_defaults")
      ? " — Run migration 013_paytabs_and_platform_ai_defaults.sql in Supabase"
      : "";
    return { error: error.message + hint };
  }

  return getPlatformAiDefaults();
}

/** Merge store overrides with platform defaults (store wins when set). */
export async function resolveEffectiveAiSettings(
  storeSettings: {
    agentName: string | null;
    openingMessage: string | null;
    replyLength: AiReplyLength | null;
    orderTemplateId: string | null;
    generalTemplateId: string | null;
  }
): Promise<StoreAiSettings & { usingPlatformDefaults: boolean }> {
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
    orderTemplateId,
    generalTemplateId,
    usingPlatformDefaults,
  };
}
