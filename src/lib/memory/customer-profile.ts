import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { emptyProfile, type CustomerSalesProfile } from "./types";

/**
 * Compatible with existing customer_sales_profiles schema:
 * id, store_id, customer_phone, language, funnel_stage, profile (jsonb), updated_at
 * Structured fields live inside profile jsonb.
 */

type ProfileJson = Partial<CustomerSalesProfile>;

function rowToProfile(data: Record<string, unknown> | null): CustomerSalesProfile {
  if (!data) return emptyProfile();
  const nested =
    data.profile && typeof data.profile === "object"
      ? (data.profile as ProfileJson)
      : {};
  return {
    name: nested.name ?? (data.name as string | null) ?? null,
    language:
      (data.language as string | null) ?? nested.language ?? null,
    funnel_stage:
      (data.funnel_stage as string | null) ?? nested.funnel_stage ?? null,
    budget_range: nested.budget_range ?? null,
    interested_products: Array.isArray(nested.interested_products)
      ? nested.interested_products
      : [],
    interested_skus: Array.isArray(nested.interested_skus)
      ? nested.interested_skus
      : [],
    objections: Array.isArray(nested.objections) ? nested.objections : [],
    last_order_summary: nested.last_order_summary ?? null,
    preferred_payment: nested.preferred_payment ?? null,
    agent_notes: nested.agent_notes ?? null,
  };
}

function uniqMerge(existing: string[], add: string[] | undefined): string[] {
  if (!add?.length) return existing;
  const set = new Set(existing.map((s) => s.trim()).filter(Boolean));
  for (const item of add) {
    const t = item.trim();
    if (t) set.add(t);
  }
  return Array.from(set).slice(0, 20);
}

export async function loadCustomerSalesProfile(
  storeId: string,
  customerPhone: string
): Promise<{
  profile: CustomerSalesProfile;
  funnelStage: string | null;
  language: string | null;
}> {
  const phone = normalizePhone(customerPhone);
  if (!phone) {
    return { profile: emptyProfile(), funnelStage: null, language: null };
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("customer_sales_profiles")
      .select("id, store_id, customer_phone, language, funnel_stage, profile, updated_at")
      .eq("store_id", storeId)
      .eq("customer_phone", phone)
      .maybeSingle();

    if (error) {
      console.warn("[customer-profile] load failed:", error.message);
      return { profile: emptyProfile(), funnelStage: null, language: null };
    }

    const profile = rowToProfile(data as Record<string, unknown> | null);
    return {
      profile,
      funnelStage: profile.funnel_stage,
      language: profile.language,
    };
  } catch (err) {
    console.warn("[customer-profile] load error:", err);
    return { profile: emptyProfile(), funnelStage: null, language: null };
  }
}

export async function mergeCustomerSalesProfile(
  storeId: string,
  customerPhone: string,
  patch: Partial<CustomerSalesProfile> & {
    funnel_stage?: string | null;
  }
): Promise<void> {
  const phone = normalizePhone(customerPhone);
  if (!phone) return;

  const current = await loadCustomerSalesProfile(storeId, phone);
  const next: CustomerSalesProfile = {
    name: patch.name?.trim() || current.profile.name,
    language: patch.language?.trim() || current.profile.language,
    funnel_stage:
      patch.funnel_stage?.trim() || current.profile.funnel_stage,
    budget_range:
      patch.budget_range?.trim() || current.profile.budget_range,
    interested_products: uniqMerge(
      current.profile.interested_products,
      patch.interested_products
    ),
    interested_skus: uniqMerge(
      current.profile.interested_skus,
      patch.interested_skus
    ),
    objections: uniqMerge(current.profile.objections, patch.objections),
    last_order_summary:
      patch.last_order_summary?.trim() ||
      current.profile.last_order_summary,
    preferred_payment:
      patch.preferred_payment?.trim() ||
      current.profile.preferred_payment,
    agent_notes:
      patch.agent_notes?.trim() || current.profile.agent_notes,
  };

  const profileJson: ProfileJson = {
    name: next.name,
    language: next.language,
    funnel_stage: next.funnel_stage,
    budget_range: next.budget_range,
    interested_products: next.interested_products,
    interested_skus: next.interested_skus,
    objections: next.objections,
    last_order_summary: next.last_order_summary,
    preferred_payment: next.preferred_payment,
    agent_notes: next.agent_notes,
  };

  try {
    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from("customer_sales_profiles")
      .select("id")
      .eq("store_id", storeId)
      .eq("customer_phone", phone)
      .maybeSingle();

    const payload = {
      store_id: storeId,
      customer_phone: phone,
      language: next.language,
      funnel_stage: next.funnel_stage,
      profile: profileJson,
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("customer_sales_profiles")
        .update(payload)
        .eq("id", existing.id);
      if (error) console.warn("[customer-profile] update failed:", error.message);
    } else {
      const { error } = await supabase
        .from("customer_sales_profiles")
        .insert(payload);
      if (error) console.warn("[customer-profile] insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[customer-profile] upsert error:", err);
  }
}

/** Format profile for system prompt; keep under ~profile_max_tokens. */
export function formatCustomerProfileBlock(
  profile: CustomerSalesProfile | null,
  maxTokens = 1200
): string {
  if (!profile) return "";
  const lines: string[] = [];
  if (profile.name) lines.push(`- Name: ${profile.name}`);
  if (profile.language) lines.push(`- Language: ${profile.language}`);
  if (profile.funnel_stage) lines.push(`- Funnel: ${profile.funnel_stage}`);
  if (profile.budget_range) lines.push(`- Budget: ${profile.budget_range}`);
  if (profile.interested_skus.length) {
    lines.push(`- Interested SKUs: ${profile.interested_skus.join(", ")}`);
  }
  if (profile.interested_products.length) {
    lines.push(
      `- Interested products: ${profile.interested_products.slice(0, 8).join(", ")}`
    );
  }
  if (profile.objections.length) {
    lines.push(`- Objections: ${profile.objections.slice(0, 8).join("; ")}`);
  }
  if (profile.last_order_summary) {
    lines.push(`- Last order: ${profile.last_order_summary}`);
  }
  if (profile.preferred_payment) {
    lines.push(`- Payment: ${profile.preferred_payment}`);
  }
  if (profile.agent_notes) {
    lines.push(`- Notes: ${profile.agent_notes}`);
  }
  if (!lines.length) return "";

  let block = `# CUSTOMER PROFILE\n${lines.join("\n")}`;
  const maxChars = maxTokens * 4;
  if (block.length > maxChars) {
    block = block.slice(0, maxChars - 3) + "...";
  }
  return block;
}
