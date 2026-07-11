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
          {usage.topupCredits > 0
            ? ` · includes ${usage.topupCredits.toLocaleString()} top-up credits`
            : ""}
        </p>
      </div>

      {!compact && (
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            AI replies per chat (spam protection)
          </p>
          <p className="mt-1 text-xs text-slate-600">
            After this many AI replies in one conversation, the chat switches to
            Human and appears under “AI exhausted”.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              max={500}
              placeholder="Unlimited"
              defaultValue={usage.conversationReplyLimit ?? ""}
              id="ai-reply-limit"
              className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                const el = document.getElementById(
                  "ai-reply-limit"
                ) as HTMLInputElement | null;
                const raw = el?.value?.trim() ?? "";
                const value = raw === "" ? null : Number(raw);
                const res = await fetch("/api/store/ai-usage", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ conversationReplyLimit: value }),
                });
                const data = await res.json();
                if (res.ok && data.usage) setUsage(data.usage);
              }}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Save limit
            </button>
            <button
              type="button"
              onClick={async () => {
                const res = await fetch("/api/store/ai-usage", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ conversationReplyLimit: null }),
                });
                const data = await res.json();
                if (res.ok && data.usage) {
                  setUsage(data.usage);
                  const el = document.getElementById(
                    "ai-reply-limit"
                  ) as HTMLInputElement | null;
                  if (el) el.value = "";
                }
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
            >
              Unlimited
            </button>
          </div>
          {usage.conversationReplyLimit != null && (
            <p className="mt-2 text-xs font-medium text-slate-700">
              Current limit: {usage.conversationReplyLimit} AI replies / chat
            </p>
          )}
        </div>
      )}

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
          WhatsApp customers will see a limit message instead of AI replies.
          Top up AI credits (even on Basic) or upgrade your plan.
        </p>
      )}
    </div>
  );
}
