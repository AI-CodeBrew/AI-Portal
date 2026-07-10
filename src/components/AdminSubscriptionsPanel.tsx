"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AdminResellerRow } from "@/lib/admin/resellers";
import { AI_PLANS, PLAN_ORDER, type PlanId } from "@/lib/ai/plans";

type PlanFilter = "all" | PlanId;

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color =
    percent >= 100
      ? "bg-red-500"
      : percent >= 80
        ? "bg-amber-500"
        : "bg-violet-500";

  return (
    <div className="w-full min-w-[100px]">
      <div className="mb-0.5 flex justify-between text-[10px] text-slate-500">
        <span>
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
        <span>{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function AdminSubscriptionsPanel({
  initialResellers,
}: {
  initialResellers: AdminResellerRow[];
}) {
  const [resellers, setResellers] = useState(initialResellers);
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<PlanId, number> = { basic: 0, pro: 0, max: 0 };
    for (const r of resellers) {
      const id = (r.store?.plan_id ?? "basic") as PlanId;
      c[id] = (c[id] ?? 0) + 1;
    }
    return c;
  }, [resellers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resellers.filter((r) => {
      const planId = (r.store?.plan_id ?? "basic") as PlanId;
      if (planFilter !== "all" && planId !== planFilter) return false;
      if (!q) return true;
      return (
        r.email.toLowerCase().includes(q) ||
        (r.full_name ?? "").toLowerCase().includes(q) ||
        (r.store?.store_name ?? "").toLowerCase().includes(q) ||
        (r.store?.shop_domain ?? "").toLowerCase().includes(q)
      );
    });
  }, [resellers, planFilter, search]);

  async function changePlan(storeId: string, planId: PlanId) {
    setSavingId(storeId);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/resellers/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, planId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update plan");
      }
      setResellers((prev) =>
        prev.map((r) =>
          r.store?.id === storeId && r.store
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
      setMessage(`Plan updated to ${AI_PLANS[planId].name}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setPlanFilter("all")}
          className={`rounded-xl border p-4 text-left shadow-sm transition ${
            planFilter === "all"
              ? "border-violet-400 bg-violet-50"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            All plans
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {resellers.length}
          </p>
        </button>
        {PLAN_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setPlanFilter(id)}
            className={`rounded-xl border p-4 text-left shadow-sm transition ${
              planFilter === id
                ? "border-violet-400 bg-violet-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {AI_PLANS[id].name}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {counts[id]}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {AI_PLANS[id].monthlyLimit.toLocaleString()} AI requests / month
            </p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reseller, store, email..."
          className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "All"],
              ...PLAN_ORDER.map((id) => [id, AI_PLANS[id].name] as const),
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPlanFilter(id as PlanFilter)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                planFilter === id
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {message}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Reseller</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">AI usage</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    No subscriptions match this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const planId = (r.store?.plan_id ?? "basic") as PlanId;
                  const used = r.aiUsage?.used ?? 0;
                  const limit =
                    r.aiUsage?.limit ?? AI_PLANS[planId].monthlyLimit;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">
                          {r.full_name || r.email}
                        </p>
                        <p className="text-xs text-slate-500">{r.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">
                          {r.store?.store_name || "—"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {r.store?.shop_domain || "No Shopify"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {r.store?.id ? (
                          <select
                            value={planId}
                            disabled={savingId === r.store.id}
                            onChange={(e) =>
                              changePlan(
                                r.store!.id,
                                e.target.value as PlanId
                              )
                            }
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-800 disabled:opacity-50"
                          >
                            {PLAN_ORDER.map((id) => (
                              <option key={id} value={id}>
                                {AI_PLANS[id].name} ·{" "}
                                {AI_PLANS[id].monthlyLimit.toLocaleString()}{" "}
                                AI req/mo
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            No store
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <UsageBar used={used} limit={limit} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/resellers`}
                          className="text-xs font-semibold text-violet-600 hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          Showing {filtered.length} of {resellers.length} resellers
          {planFilter !== "all"
            ? ` · filtered by ${AI_PLANS[planFilter].name}`
            : ""}
        </div>
      </div>
    </div>
  );
}
