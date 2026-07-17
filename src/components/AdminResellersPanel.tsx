"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AI_PLANS, PLAN_ORDER, normalizePlanId, type PlanId } from "@/lib/ai/plans";
import type { AdminResellerRow } from "@/lib/admin/resellers";

function ConnectionBadge({
  connected,
  label,
}: {
  connected: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
        connected
          ? "bg-emerald-100 text-emerald-800"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {connected ? label : "Not connected"}
    </span>
  );
}

function UsageCell({ reseller }: { reseller: AdminResellerRow }) {
  const usage = reseller.aiUsage;
  if (!usage) return <span className="text-slate-400">—</span>;

  const atLimit = usage.limitReached;
  return (
    <div>
      <p
        className={`text-sm font-semibold ${atLimit ? "text-red-700" : "text-slate-900"}`}
      >
        {usage.used.toLocaleString()} / {usage.limit.toLocaleString()}
      </p>
      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${atLimit ? "bg-red-500" : usage.percentUsed >= 80 ? "bg-amber-500" : "bg-violet-600"}`}
          style={{ width: `${Math.min(100, usage.percentUsed)}%` }}
        />
      </div>
    </div>
  );
}

function PlanSelect({
  storeId,
  currentPlan,
  onUpdated,
}: {
  storeId: string;
  currentPlan: PlanId;
  onUpdated: (planId: PlanId) => void;
}) {
  const [planId, setPlanId] = useState(currentPlan);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: PlanId) {
    setPlanId(next);
    setSaving(true);
    const res = await fetch("/api/admin/resellers/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId, planId: next }),
    });
    setSaving(false);
    if (res.ok) onUpdated(next);
    else setPlanId(currentPlan);
  }

  return (
    <select
      value={planId}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value as PlanId)}
      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-medium text-slate-800 disabled:opacity-50"
      onClick={(e) => e.stopPropagation()}
    >
      {PLAN_ORDER.map((id) => (
        <option key={id} value={id}>
          {AI_PLANS[id].name}
        </option>
      ))}
    </select>
  );
}

function ResellerDetailModal({
  reseller,
  onClose,
  onPlanUpdated,
}: {
  reseller: AdminResellerRow;
  onClose: () => void;
  onPlanUpdated: (storeId: string, planId: PlanId) => void;
}) {
  const planId = normalizePlanId(reseller.store?.plan_id);
  const storeId = reseller.store_id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {reseller.full_name || reseller.email}
              </h2>
              <p className="text-sm text-slate-600">{reseller.email}</p>
              {reseller.store?.store_name && (
                <p className="mt-1 text-sm font-medium text-violet-700">
                  {reseller.store.store_name}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Plan & AI usage
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {storeId ? (
                <PlanSelect
                  storeId={storeId}
                  currentPlan={planId}
                  onUpdated={(id) => onPlanUpdated(storeId, id)}
                />
              ) : (
                <span className="text-sm text-slate-500">No store linked</span>
              )}
              <UsageCell reseller={reseller} />
            </div>
            {reseller.store?.ai_agent_name && (
              <p className="mt-2 text-sm text-slate-600">
                AI agent:{" "}
                <span className="font-medium text-slate-900">
                  {reseller.store.ai_agent_name}
                </span>
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Integrations
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ConnectionBadge
                connected={Boolean(reseller.store?.shopify_access_token)}
                label={reseller.store?.shop_domain ?? "Shopify"}
              />
              <ConnectionBadge
                connected={Boolean(reseller.store?.whatsapp_phone_number_id)}
                label="WhatsApp"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: "Orders",
                value: reseller.orderCount.toLocaleString(),
              },
              { label: "Products", value: reseller.productCount },
              { label: "Chats", value: reseller.chatCount },
              { label: "Ad links", value: reseller.adLinkCount },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center"
              >
                <p className="text-lg font-bold text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-600">{stat.label}</p>
              </div>
            ))}
          </div>
          {reseller.shopifyOrderCount != null && (
            <p className="text-xs text-slate-500">
              {reseller.shopifyOrderCount.toLocaleString()} on Shopify ·{" "}
              {reseller.syncedOrderCount.toLocaleString()} synced in portal
            </p>
          )}

          <p className="text-xs text-slate-500">
            Joined {new Date(reseller.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>

          {storeId && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Link
                href={`/admin/orders?store=${storeId}`}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
              >
                View orders
              </Link>
              <Link
                href={`/admin/chats?store=${storeId}`}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                View chats
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function matchesSearch(r: AdminResellerRow, q: string): boolean {
  const haystack = [
    r.full_name,
    r.email,
    r.store?.store_name,
    r.store?.shop_domain,
    r.store?.ai_agent_name,
    r.store?.plan_id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function AdminResellersPanel({
  initialResellers,
}: {
  initialResellers: AdminResellerRow[];
}) {
  const [resellers, setResellers] = useState(initialResellers);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "at_limit" | "no_store">("all");
  const [detailReseller, setDetailReseller] = useState<AdminResellerRow | null>(
    null
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resellers.filter((r) => {
      if (filter === "at_limit" && !r.aiUsage?.limitReached) return false;
      if (filter === "no_store" && r.store_id) return false;
      if (q && !matchesSearch(r, q)) return false;
      return true;
    });
  }, [resellers, search, filter]);

  function handlePlanUpdated(storeId: string, planId: PlanId) {
    setResellers((prev) =>
      prev.map((r) =>
        r.store_id === storeId && r.store
          ? {
              ...r,
              store: { ...r.store, plan_id: planId },
              aiUsage: r.aiUsage
                ? {
                    ...r.aiUsage,
                    planId,
                    plan: AI_PLANS[planId],
                    limit: AI_PLANS[planId].monthlyLimit,
                    remaining: Math.max(
                      0,
                      AI_PLANS[planId].monthlyLimit - r.aiUsage.used
                    ),
                    percentUsed: Math.min(
                      100,
                      Math.round(
                        (r.aiUsage.used / AI_PLANS[planId].monthlyLimit) * 100
                      )
                    ),
                    limitReached:
                      r.aiUsage.used >= AI_PLANS[planId].monthlyLimit,
                  }
                : r.aiUsage,
            }
          : r
      )
    );
    setDetailReseller((prev) =>
      prev?.store_id === storeId && prev.store
        ? {
            ...prev,
            store: { ...prev.store, plan_id: planId },
          }
        : prev
    );
    setMessage(`Plan updated to ${AI_PLANS[planId].name}.`);
    setTimeout(() => setMessage(null), 3000);
  }

  const atLimitCount = resellers.filter((r) => r.aiUsage?.limitReached).length;

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          {filtered.length} of {resellers.length} reseller
          {resellers.length === 1 ? "" : "s"}
          {atLimitCount > 0 && (
            <span className="ml-2 text-red-700">
              · {atLimitCount} at AI limit
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="Search name, email, store..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-56"
          />
          <select
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as "all" | "at_limit" | "no_store")
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All resellers</option>
            <option value="at_limit">At AI limit</option>
            <option value="no_store">No store linked</option>
          </select>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Reseller
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Plan
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                AI usage
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Integrations
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Activity
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Joined
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-600">
                  No resellers match your filters
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setDetailReseller(r)}
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {r.full_name || r.email}
                    </p>
                    <p className="text-xs text-slate-600">{r.email}</p>
                    {r.store?.store_name && (
                      <p className="text-xs text-violet-700">
                        {r.store.store_name}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {r.store_id ? (
                      <PlanSelect
                        storeId={r.store_id}
                        currentPlan={normalizePlanId(r.store?.plan_id)}
                        onUpdated={(planId) =>
                          handlePlanUpdated(r.store_id!, planId)
                        }
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <UsageCell reseller={r} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <ConnectionBadge
                        connected={Boolean(r.store?.shopify_access_token)}
                        label={r.store?.shop_domain ?? "Shopify"}
                      />
                      <ConnectionBadge
                        connected={Boolean(r.store?.whatsapp_phone_number_id)}
                        label="WhatsApp"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">
                      {r.orderCount.toLocaleString()} orders
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.productCount} products ·{" "}
                      {r.shopifyOrderCount != null
                        ? `${r.shopifyOrderCount.toLocaleString()} on Shopify`
                        : `${r.syncedOrderCount.toLocaleString()} synced`}
                      {" · "}
                      {r.chatCount} chats
                    </p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {r.store_id ? (
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/admin/orders?store=${r.store_id}`}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-violet-600 hover:bg-violet-50"
                        >
                          Orders
                        </Link>
                        <Link
                          href={`/admin/chats?store=${r.store_id}`}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-violet-600 hover:bg-violet-50"
                        >
                          Chats
                        </Link>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-4 md:hidden">
        {filtered.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setDetailReseller(r)}
            >
              <p className="font-semibold text-slate-900">
                {r.full_name || r.email}
              </p>
              <p className="text-sm text-slate-600">{r.email}</p>
            </button>
            {r.store_id && (
              <div className="mt-3">
                <PlanSelect
                  storeId={r.store_id}
                  currentPlan={normalizePlanId(r.store?.plan_id)}
                  onUpdated={(planId) => handlePlanUpdated(r.store_id!, planId)}
                />
              </div>
            )}
            <div className="mt-3">
              <UsageCell reseller={r} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ConnectionBadge
                connected={Boolean(r.store?.shopify_access_token)}
                label={r.store?.shop_domain ?? "Shopify"}
              />
              <ConnectionBadge
                connected={Boolean(r.store?.whatsapp_phone_number_id)}
                label="WhatsApp"
              />
            </div>
            {r.store_id && (
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/admin/orders?store=${r.store_id}`}
                  className="text-sm font-semibold text-violet-600"
                >
                  Orders
                </Link>
                <Link
                  href={`/admin/chats?store=${r.store_id}`}
                  className="text-sm font-semibold text-violet-600"
                >
                  Chats
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>

      {detailReseller && (
        <ResellerDetailModal
          reseller={detailReseller}
          onClose={() => setDetailReseller(null)}
          onPlanUpdated={handlePlanUpdated}
        />
      )}
    </div>
  );
}
