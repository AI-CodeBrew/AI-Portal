import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_GENERAL_TEMPLATE_ID,
  DEFAULT_ORDER_TEMPLATE_ID,
  type AiPromptTemplate,
  type AiReplyLength,
  type AiTemplateCategory,
  type ResolvedStoreAiConfig,
  type StoreAiSettings,
} from "./ai-settings-types";
import { resolveEffectiveAiSettings } from "./platform-defaults";

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
      "ai_agent_name, ai_opening_message, ai_reply_length, ai_order_template_id, ai_general_template_id"
    )
    .eq("id", storeId)
    .single();

  return {
    agentName: (data?.ai_agent_name as string | null) ?? null,
    openingMessage: (data?.ai_opening_message as string | null) ?? null,
    replyLength: (data?.ai_reply_length as AiReplyLength) ?? "medium",
    orderTemplateId: (data?.ai_order_template_id as string | null) ?? null,
    generalTemplateId: (data?.ai_general_template_id as string | null) ?? null,
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

  return {
    agentName: settings.agentName,
    openingMessage: settings.openingMessage,
    replyLength: settings.replyLength,
    orderTemplateId: settings.orderTemplateId,
    generalTemplateId: settings.generalTemplateId,
    orderTemplatePrompt,
    generalTemplatePrompt,
  };
}

export async function updateStoreAiSettings(
  storeId: string,
  input: Partial<StoreAiSettings>
): Promise<StoreAiSettings | { error: string }> {
  const supabase = createAdminClient();
  const payload: Record<string, string | null> = {};

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

  const { error } = await supabase
    .from("stores")
    .update(payload)
    .eq("id", storeId);

  if (error) {
    const hint = error.message.includes("ai_agent_name")
      ? " — Run migration 009_ai_settings.sql in Supabase"
      : "";
    return { error: error.message + hint };
  }

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
    .replace(/\{agent_name\}/gi, vars.agentName)
    .replace(/\{store_name\}/gi, vars.storeName);
}
