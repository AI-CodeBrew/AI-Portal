import { createAdminClient } from "@/lib/supabase/admin";
import {
  currentPeriodMonth,
  getPlan,
  type PlanId,
  type AiPlan,
} from "./plans";

export interface StoreAiUsage {
  storeId: string;
  planId: PlanId;
  plan: AiPlan;
  periodMonth: string;
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  limitReached: boolean;
  /** Purchased bonus credits included in limit */
  topupCredits: number;
  /** Max AI replies per conversation before human handoff */
  conversationReplyLimit: number | null;
}

type QuotaRpcResult = {
  allowed: boolean;
  plan_id?: string;
  limit?: number;
  used?: number;
  period_month?: string;
  reason?: string;
};

export async function getStoreAiUsage(storeId: string): Promise<StoreAiUsage> {
  const supabase = createAdminClient();
  const periodMonth = currentPeriodMonth();

  const { data: store } = await supabase
    .from("stores")
    .select("plan_id, ai_topup_credits, ai_conversation_reply_limit")
    .eq("id", storeId)
    .maybeSingle();

  const planId = (store?.plan_id ?? "basic") as PlanId;
  const plan = getPlan(planId);
  const topupCredits = Number(store?.ai_topup_credits ?? 0);
  const limit = plan.monthlyLimit + Math.max(0, topupCredits);

  const { data: usage } = await supabase
    .from("store_ai_usage")
    .select("request_count")
    .eq("store_id", storeId)
    .eq("period_month", periodMonth)
    .maybeSingle();

  const used = usage?.request_count ?? 0;
  const remaining = Math.max(0, limit - used);
  const percentUsed = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return {
    storeId,
    planId,
    plan,
    periodMonth,
    used,
    limit,
    remaining,
    percentUsed,
    limitReached: used >= limit,
    topupCredits,
    conversationReplyLimit:
      store?.ai_conversation_reply_limit != null
        ? Number(store.ai_conversation_reply_limit)
        : null,
  };
}

export async function tryConsumeAiQuota(storeId: string): Promise<{
  allowed: boolean;
  usage: StoreAiUsage;
  reason?: string;
}> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("try_consume_ai_quota", {
    p_store_id: storeId,
  });

  if (error) {
    console.error("[ai-quota] RPC failed:", error.message);
    const usage = await getStoreAiUsage(storeId);
    return { allowed: true, usage, reason: "quota_rpc_unavailable" };
  }

  const result = data as QuotaRpcResult;
  const planId = (result.plan_id ?? "basic") as PlanId;
  const plan = getPlan(planId);
  const used = result.used ?? 0;
  const limit = result.limit ?? plan.monthlyLimit;
  const periodMonth = result.period_month ?? currentPeriodMonth();
  const remaining = Math.max(0, limit - used);
  const base = await getStoreAiUsage(storeId);

  const usage: StoreAiUsage = {
    storeId,
    planId,
    plan,
    periodMonth,
    used,
    limit,
    remaining,
    percentUsed: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
    limitReached: !result.allowed || used >= limit,
    topupCredits: base.topupCredits,
    conversationReplyLimit: base.conversationReplyLimit,
  };

  return {
    allowed: Boolean(result.allowed),
    usage,
    reason: result.reason,
  };
}

export async function updateConversationReplyLimit(
  storeId: string,
  limit: number | null
): Promise<{ ok: boolean; error?: string }> {
  if (limit != null && (!Number.isFinite(limit) || limit < 1 || limit > 500)) {
    return { error: "Limit must be between 1 and 500", ok: false };
  }
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("stores")
    .update({ ai_conversation_reply_limit: limit })
    .eq("id", storeId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function applyTopupCredits(
  storeId: string,
  credits: number
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("apply_ai_topup_credits", {
    p_store_id: storeId,
    p_credits: credits,
  });
  if (error) {
    // Fallback if RPC missing
    const usage = await getStoreAiUsage(storeId);
    const { error: updErr } = await supabase
      .from("stores")
      .update({ ai_topup_credits: usage.topupCredits + credits })
      .eq("id", storeId);
    if (updErr) return { ok: false, error: updErr.message };
  }
  return { ok: true };
}

export async function setStorePlan(
  storeId: string,
  planId: PlanId
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("stores")
    .update({ plan_id: planId })
    .eq("id", storeId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function getBulkStoreAiUsage(
  storeIds: string[]
): Promise<Map<string, StoreAiUsage>> {
  const map = new Map<string, StoreAiUsage>();
  if (storeIds.length === 0) return map;

  await Promise.all(
    storeIds.map(async (id) => {
      map.set(id, await getStoreAiUsage(id));
    })
  );
  return map;
}
