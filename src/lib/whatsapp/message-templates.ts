import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStoreWhatsAppCredentials,
} from "@/lib/whatsapp";

const GRAPH_API = "https://graph.facebook.com/v21.0";

export type WaTemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";
/** Categories available when creating/editing templates in the portal */
export type WaTemplateCategorySelectable = "UTILITY" | "MARKETING";

export type WaTemplateStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "paused"
  | "disabled";

export interface WhatsAppMessageTemplate {
  id: string;
  store_id: string;
  name: string;
  category: WaTemplateCategory;
  language: string;
  header_text: string | null;
  body_text: string;
  footer_text: string | null;
  status: WaTemplateStatus;
  meta_template_id: string | null;
  meta_status: string | null;
  rejection_reason: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWaTemplateInput {
  name: string;
  category: WaTemplateCategorySelectable;
  language: string;
  headerText?: string | null;
  bodyText: string;
  footerText?: string | null;
}

const NAME_PATTERN = /^[a-z0-9_]+$/;

function mapRow(row: Record<string, unknown>): WhatsAppMessageTemplate {
  return {
    id: row.id as string,
    store_id: row.store_id as string,
    name: row.name as string,
    category: row.category as WaTemplateCategory,
    language: row.language as string,
    header_text: (row.header_text as string | null) ?? null,
    body_text: row.body_text as string,
    footer_text: (row.footer_text as string | null) ?? null,
    status: row.status as WaTemplateStatus,
    meta_template_id: (row.meta_template_id as string | null) ?? null,
    meta_status: (row.meta_status as string | null) ?? null,
    rejection_reason: (row.rejection_reason as string | null) ?? null,
    last_synced_at: (row.last_synced_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function normalizeMetaStatus(metaStatus: string | null | undefined): WaTemplateStatus {
  const s = (metaStatus || "").toUpperCase();
  if (s === "APPROVED") return "approved";
  if (s === "REJECTED" || s === "PENDING_DELETION") return "rejected";
  if (s === "PAUSED") return "paused";
  if (s === "DISABLED") return "disabled";
  if (s === "PENDING" || s === "IN_APPEAL") return "pending";
  return "pending";
}

/** Meta often returns en_US while the portal stores en — normalize for matching. */
function normalizeTemplateLanguage(lang: string | null | undefined): string {
  const raw = (lang || "en").trim().toLowerCase().replace(/-/g, "_");
  if (raw === "en" || raw.startsWith("en_")) return "en";
  if (raw.includes("_")) return raw.split("_")[0] || raw;
  return raw;
}

function templateMatchKey(name: string, language: string | null | undefined): string {
  return `${name.trim().toLowerCase()}::${normalizeTemplateLanguage(language)}`;
}

async function getStoreWaContext(storeId: string): Promise<
  | { wabaId: string; accessToken: string }
  | { error: string }
> {
  const supabase = createAdminClient();
  const { data: store } = await supabase
    .from("stores")
    .select(
      "whatsapp_waba_id, whatsapp_phone_number_id, whatsapp_access_token"
    )
    .eq("id", storeId)
    .single();

  if (!store) return { error: "Store not found" };

  const creds = getStoreWhatsAppCredentials({
    whatsapp_phone_number_id: store.whatsapp_phone_number_id,
    whatsapp_access_token: store.whatsapp_access_token,
  });
  if (!creds) {
    return { error: "WhatsApp is not connected. Connect it under Integrations first." };
  }

  const wabaId =
    (store.whatsapp_waba_id as string | null) ||
    process.env.WHATSAPP_WABA_ID ||
    null;
  if (!wabaId) {
    return {
      error:
        "WhatsApp Business Account ID (WABA) is missing. Reconnect WhatsApp.",
    };
  }

  return { wabaId, accessToken: creds.accessToken };
}

function buildMetaComponents(input: {
  headerText?: string | null;
  bodyText: string;
  footerText?: string | null;
}) {
  const components: Array<Record<string, unknown>> = [];

  if (input.headerText?.trim()) {
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: input.headerText.trim(),
    });
  }

  components.push({
    type: "BODY",
    text: input.bodyText.trim(),
  });

  if (input.footerText?.trim()) {
    components.push({
      type: "FOOTER",
      text: input.footerText.trim(),
    });
  }

  return components;
}

export async function listWhatsAppTemplates(
  storeId: string
): Promise<WhatsAppMessageTemplate[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_message_templates")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[wa-templates] list:", error.message);
    return [];
  }
  // Hide auto-imported Meta stubs (legacy rows)
  return (data ?? [])
    .map(mapRow)
    .filter(
      (t) => !t.body_text.startsWith("(Imported from Meta")
    );
}

export async function createWhatsAppTemplate(
  storeId: string,
  input: CreateWaTemplateInput
): Promise<WhatsAppMessageTemplate | { error: string }> {
  const name = input.name.trim().toLowerCase();
  const bodyText = input.bodyText.trim();

  if (!name) return { error: "Template name is required" };
  if (!NAME_PATTERN.test(name)) {
    return {
      error: "Template name must be lowercase letters, numbers, and underscores only",
    };
  }
  if (!bodyText) return { error: "Body is required" };

  const category: WaTemplateCategorySelectable =
    input.category === "MARKETING" ? "MARKETING" : "UTILITY";

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_message_templates")
    .insert({
      store_id: storeId,
      name,
      category,
      language: input.language || "en",
      header_text: input.headerText?.trim() || null,
      body_text: bodyText,
      footer_text: input.footerText?.trim() || null,
      status: "draft",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A template with this name and language already exists" };
    }
    const hint = error.message.includes("whatsapp_message_templates")
      ? " — Run migration 015_whatsapp_message_templates.sql in Supabase"
      : "";
    return { error: error.message + hint };
  }

  return mapRow(data);
}

export async function updateWhatsAppTemplate(
  storeId: string,
  templateId: string,
  input: Partial<CreateWaTemplateInput>
): Promise<WhatsAppMessageTemplate | { error: string }> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("whatsapp_message_templates")
    .select("*")
    .eq("id", templateId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!existing) return { error: "Template not found" };
  if (existing.status === "approved" || existing.status === "pending") {
    return {
      error:
        "Approved or pending templates cannot be edited. Create a new template instead.",
    };
  }

  const payload: Record<string, string | null> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) {
    const name = input.name.trim().toLowerCase();
    if (!NAME_PATTERN.test(name)) {
      return {
        error:
          "Template name must be lowercase letters, numbers, and underscores only",
      };
    }
    payload.name = name;
  }
  if (input.category !== undefined) {
    payload.category =
      input.category === "MARKETING" ? "MARKETING" : "UTILITY";
  }
  if (input.language !== undefined) payload.language = input.language;
  if (input.headerText !== undefined) {
    payload.header_text = input.headerText?.trim() || null;
  }
  if (input.bodyText !== undefined) {
    const body = input.bodyText.trim();
    if (!body) return { error: "Body is required" };
    payload.body_text = body;
  }
  if (input.footerText !== undefined) {
    payload.footer_text = input.footerText?.trim() || null;
  }

  const { data, error } = await supabase
    .from("whatsapp_message_templates")
    .update(payload)
    .eq("id", templateId)
    .eq("store_id", storeId)
    .select("*")
    .single();

  if (error) return { error: error.message };
  return mapRow(data);
}

export async function deleteWhatsAppTemplate(
  storeId: string,
  templateId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("whatsapp_message_templates")
    .select("*")
    .eq("id", templateId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!existing) return { error: "Template not found" };

  // Try delete from Meta if submitted
  if (existing.meta_template_id || existing.status !== "draft") {
    const ctx = await getStoreWaContext(storeId);
    if (!("error" in ctx)) {
      try {
        await fetch(
          `${GRAPH_API}/${ctx.wabaId}/message_templates?name=${encodeURIComponent(existing.name)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${ctx.accessToken}` },
          }
        );
      } catch (err) {
        console.warn("[wa-templates] Meta delete failed:", err);
      }
    }
  }

  const { error } = await supabase
    .from("whatsapp_message_templates")
    .delete()
    .eq("id", templateId)
    .eq("store_id", storeId);

  if (error) return { error: error.message };
  return { ok: true };
}

/** Submit local draft to Meta for review */
export async function submitWhatsAppTemplateToMeta(
  storeId: string,
  templateId: string
): Promise<WhatsAppMessageTemplate | { error: string }> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("whatsapp_message_templates")
    .select("*")
    .eq("id", templateId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!existing) return { error: "Template not found" };
  if (existing.status === "approved") {
    return { error: "Template is already approved" };
  }
  if (existing.status === "pending") {
    return { error: "Template is already awaiting Meta review" };
  }

  const ctx = await getStoreWaContext(storeId);
  if ("error" in ctx) return ctx;

  const payload = {
    name: existing.name,
    language: existing.language,
    category: existing.category,
    components: buildMetaComponents({
      headerText: existing.header_text,
      bodyText: existing.body_text,
      footerText: existing.footer_text,
    }),
  };

  const res = await fetch(`${GRAPH_API}/${ctx.wabaId}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let parsed: {
    id?: string;
    status?: string;
    error?: { message?: string; error_user_msg?: string };
  } = {};
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    // keep empty
  }

  if (!res.ok) {
    const detail =
      parsed.error?.error_user_msg ||
      parsed.error?.message ||
      raw;
    return { error: `Meta rejected submit: ${detail}` };
  }

  const metaStatus = parsed.status || "PENDING";
  const status = normalizeMetaStatus(metaStatus);

  const { data, error } = await supabase
    .from("whatsapp_message_templates")
    .update({
      status,
      meta_template_id: parsed.id ?? existing.meta_template_id,
      meta_status: metaStatus,
      rejection_reason: null,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId)
    .select("*")
    .single();

  if (error) return { error: error.message };
  return mapRow(data);
}

/** Sync statuses from Meta for this store's templates */
export async function syncWhatsAppTemplatesFromMeta(
  storeId: string
): Promise<
  | { templates: WhatsAppMessageTemplate[]; synced: number }
  | { error: string }
> {
  const ctx = await getStoreWaContext(storeId);
  if ("error" in ctx) return ctx;

  const res = await fetch(
    `${GRAPH_API}/${ctx.wabaId}/message_templates?limit=100&fields=name,status,language,category,id,rejected_reason`,
    {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    }
  );

  const raw = await res.text();
  let parsed: {
    data?: Array<{
      id?: string;
      name?: string;
      status?: string;
      language?: string;
      category?: string;
      rejected_reason?: string;
    }>;
    error?: { message?: string };
  } = {};
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return { error: `Invalid Meta response: ${raw.slice(0, 200)}` };
  }

  if (!res.ok) {
    return {
      error: parsed.error?.message || `Meta sync failed: ${raw.slice(0, 200)}`,
    };
  }

  const supabase = createAdminClient();
  const local = await listWhatsAppTemplates(storeId);
  // Only sync status for templates the reseller created in the portal —
  // do not import Meta's sample / other account templates.
  const byKey = new Map(
    local.map((t) => [templateMatchKey(t.name, t.language), t])
  );

  let synced = 0;
  for (const remote of parsed.data ?? []) {
    if (!remote.name) continue;
    const key = templateMatchKey(remote.name, remote.language || "en");
    const localRow = byKey.get(key);
    if (!localRow) continue;

    const status = normalizeMetaStatus(remote.status);
    const now = new Date().toISOString();

    await supabase
      .from("whatsapp_message_templates")
      .update({
        status,
        meta_template_id: remote.id ?? localRow.meta_template_id,
        meta_status: remote.status ?? null,
        rejection_reason:
          remote.rejected_reason && remote.rejected_reason !== "NONE"
            ? remote.rejected_reason
            : null,
        last_synced_at: now,
        updated_at: now,
      })
      .eq("id", localRow.id);
    synced++;
  }

  // Remove previously auto-imported Meta stubs (not created in portal)
  await supabase
    .from("whatsapp_message_templates")
    .delete()
    .eq("store_id", storeId)
    .like("body_text", "(Imported from Meta%");

  const templates = await listWhatsAppTemplates(storeId);
  return { templates, synced };
}

export function templateStats(templates: WhatsAppMessageTemplate[]) {
  return {
    total: templates.length,
    approved: templates.filter((t) => t.status === "approved").length,
    pending: templates.filter(
      (t) => t.status === "pending" || t.status === "draft"
    ).length,
    rejected: templates.filter((t) => t.status === "rejected").length,
  };
}

export async function getApprovedWhatsAppOrderTemplate(
  storeId: string
): Promise<{ name: string; language: string } | null> {
  const supabase = createAdminClient();
  const { data: store } = await supabase
    .from("stores")
    .select("whatsapp_order_template_id")
    .eq("id", storeId)
    .single();

  const templateId = store?.whatsapp_order_template_id as string | null;
  if (!templateId) return null;

  const { data: tpl } = await supabase
    .from("whatsapp_message_templates")
    .select("name, language, status")
    .eq("id", templateId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!tpl || tpl.status !== "approved") return null;
  return { name: tpl.name as string, language: (tpl.language as string) || "en" };
}
