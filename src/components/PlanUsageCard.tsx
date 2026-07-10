"use client";

import { useEffect, useState } from "react";
import {
  AI_PLANS,
  PLAN_ORDER,
  formatPeriodMonth,
  type PlanId,
} from "@/lib/ai/plans";
import type { StoreAiUsage } from "@/lib/ai/quota";

function UsageBar({ percent }: { percent: number }) {
  const color =
    percent >= 100
      ? "bg-red-500"
      : percent >= 80
        ? "bg-amber-500"
        : "bg-blue-600";

  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

export function PlanUsageCard({ compact }: { compact?: boolean }) {
  const [usage, setUsage] = useState<StoreAiUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/store/ai-usage")
      .then((res) => res.json())
      .then((data) => setUsage(data.usage ?? null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Loading plan usage...
      </div>
    );
  }

  if (!usage) return null;

  return (
    <div
      className={`rounded-xl border shadow-sm ${
        usage.limitReached
          ? "border-red-200 bg-red-50"
          : "border-slate-200 bg-white"
      } ${compact ? "p-4" : "p-6"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            AI Plan
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {usage.plan.name}
          </p>
          <p className="text-xs text-slate-600">
            {formatPeriodMonth(usage.periodMonth)} · resets monthly
          </p>
        </div>
        {usage.limitReached && (
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
            Limit reached
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-sm">
          <span className="font-medium text-slate-700">AI replies used</span>
          <span className="font-semibold text-slate-900">
            {usage.used.toLocaleString()} / {usage.limit.toLocaleString()}
          </span>
        </div>
        <UsageBar percent={usage.percentUsed} />
        <p className="mt-2 text-xs text-slate-600">
          {usage.remaining.toLocaleString()} remaining this month
        </p>
      </div>

      {!compact && (
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {PLAN_ORDER.map((id) => {
            const plan = AI_PLANS[id];
            const current = id === usage.planId;
            return (
              <div
                key={id}
                className={`rounded-lg border p-3 text-sm ${
                  current
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <p className="font-semibold text-slate-900">{plan.name}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {plan.monthlyLimit.toLocaleString()} AI requests / month
                </p>
                {current && (
                  <p className="mt-1 text-xs font-semibold text-blue-700">
                    Current plan
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {usage.limitReached && (
        <p className="mt-4 text-sm font-medium text-red-800">
          WhatsApp customers will see a limit message instead of AI replies
          until you upgrade. Open Plan & Usage to select Pro or Max and pay.
        </p>
      )}
    </div>
  );
}
