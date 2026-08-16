"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import type {
  AdminPeriodMetric,
  AdminPlatformStats,
} from "@/lib/admin/stats";
import { AI_PLANS, type PlanId } from "@/lib/ai/plans";

function formatDelta(metric: AdminPeriodMetric): string {
  if (metric.deltaPercent == null) {
    return metric.current > 0 ? "New vs last 7 days" : "vs last 7 days";
  }
  const sign = metric.deltaPercent > 0 ? "+" : "";
  return `${sign}${metric.deltaPercent}% vs last 7 days`;
}

function deltaColor(metric: AdminPeriodMetric): string {
  if (metric.deltaPercent == null) return "text-slate-500";
  if (metric.deltaPercent > 0) return "text-emerald-600";
  if (metric.deltaPercent < 0) return "text-red-600";
  return "text-slate-500";
}

function StatCard({
  label,
  value,
  sub,
  metric,
  href,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  metric?: AdminPeriodMetric;
  href?: string;
  accent: "violet" | "emerald" | "amber" | "blue" | "red";
}) {
  const border = {
    violet: "border-l-violet-500",
    emerald: "border-l-emerald-500",
    amber: "border-l-amber-500",
    blue: "border-l-blue-500",
    red: "border-l-red-500",
  }[accent];

  const inner = (
    <div
      className={`rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm md:p-5 ${border}`}
    >
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 lg:text-3xl">{value}</p>
      {metric ? (
        <p className={`mt-1 text-xs font-medium ${deltaColor(metric)}`}>
          {formatDelta(metric)}
        </p>
      ) : (
        sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>
      )}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

function MiniBarChart({ points }: { points: AdminPlatformStats["chart"] }) {
  const max = Math.max(
    1,
    ...points.map((p) => Math.max(p.conversations, p.orders))
  );

  return (
    <div className="mt-4">
      <div className="flex h-28 items-end gap-1.5 md:h-32 md:gap-2 lg:h-36">
        {points.map((p) => (
          <div key={p.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex h-20 w-full items-end justify-center gap-0.5 md:h-24 lg:h-28">
              <div
                className="w-2 rounded-t bg-blue-400/90"
                style={{
                  height: `${Math.max(4, (p.conversations / max) * 100)}%`,
                }}
              />
              <div
                className="w-2 rounded-t bg-emerald-500"
                style={{ height: `${Math.max(4, (p.orders / max) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-slate-500">
              {p.label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-blue-400" /> Conversations
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Orders
        </span>
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminPlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then((data) => setStats(data.stats ?? null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Loading platform stats...
      </div>
    );
  }

  if (!stats) return null;

  const currency = stats.period.revenue.currency || "AED";
  const hasTraffic = stats.chart.some(
    (p) => p.conversations > 0 || p.orders > 0
  );
  const otherCurrencies = stats.revenueByCurrency.filter(
    (r) => r.currency !== currency && r.current > 0
  );
  const revenueSub =
    otherCurrencies.length > 0
      ? `+ ${otherCurrencies
          .map((r) => formatMoney(r.current, r.currency))
          .join(", ")} (shown separately — different currency)`
      : undefined;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-5">
        <StatCard
          label="Total Conversations"
          value={stats.period.conversations.current.toLocaleString()}
          metric={stats.period.conversations}
          href="/admin/chats"
          accent="blue"
        />
        <StatCard
          label="Orders Created"
          value={stats.period.ordersCreated.current.toLocaleString()}
          metric={stats.period.ordersCreated}
          href="/admin/orders"
          accent="emerald"
        />
        <StatCard
          label="Confirmed Orders"
          value={stats.period.confirmedOrders.current.toLocaleString()}
          metric={stats.period.confirmedOrders}
          href="/admin/orders"
          accent="emerald"
        />
        <StatCard
          label="Conversion Rate"
          value={`${stats.period.conversionRate.current.toFixed(1)}%`}
          metric={stats.period.conversionRate}
          accent="violet"
        />
        <StatCard
          label={`Revenue (${currency})`}
          value={formatMoney(stats.period.revenue.current, currency)}
          sub={revenueSub}
          metric={stats.period.revenue}
          href="/admin/orders"
          accent="amber"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-4">
        <StatCard
          label="Resellers"
          value={stats.resellers}
          sub="Registered accounts"
          href="/admin/resellers"
          accent="violet"
        />
        <StatCard
          label="Total orders"
          value={stats.orders.total.toLocaleString()}
          sub={`${stats.orders.pending} pending · ${stats.orders.confirmed} confirmed`}
          href="/admin/orders"
          accent="emerald"
        />
        <StatCard
          label="WhatsApp chats"
          value={stats.chats.total}
          sub={`${stats.chats.handoff} manual handoff`}
          href="/admin/chats"
          accent="blue"
        />
        <StatCard
          label="AI limit hit"
          value={stats.aiLimitReached}
          sub="Resellers at quota"
          href="/admin/resellers"
          accent={stats.aiLimitReached > 0 ? "red" : "amber"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 lg:col-span-2 lg:p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-bold text-slate-900">Conversations & Orders</h2>
              <p className="text-xs text-slate-500">Last 7 days · platform-wide</p>
            </div>
          </div>
          {hasTraffic ? (
            <MiniBarChart points={stats.chart} />
          ) : (
            <p className="mt-8 text-center text-sm text-slate-500">
              No traffic yet across resellers.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 lg:p-6">
          <h2 className="font-bold text-slate-900">AI Performance</h2>
          <p className="text-xs text-slate-500">All conversations</p>
          <p className="mt-4 text-4xl font-bold text-slate-900">
            {stats.aiPerformance.successRate}%
          </p>
          <p className="text-sm font-medium text-slate-600">AI Success</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-blue-50 px-3 py-3">
              <p className="text-xs font-medium text-blue-700">Handled by AI</p>
              <p className="mt-1 text-xl font-bold text-blue-900">
                {stats.aiPerformance.handledByAi}
              </p>
            </div>
            <div className="rounded-xl bg-violet-50 px-3 py-3">
              <p className="text-xs font-medium text-violet-700">Human Takeover</p>
              <p className="mt-1 text-xl font-bold text-violet-900">
                {stats.aiPerformance.humanTakeover}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-4">
        <StatCard
          label="Shopify connected"
          value={stats.integrations.shopify}
          accent="emerald"
        />
        <StatCard
          label="WhatsApp connected"
          value={stats.integrations.whatsapp}
          accent="emerald"
        />
        <StatCard
          label="Meta connected"
          value={stats.integrations.meta}
          accent="violet"
        />
        <StatCard
          label="Catalog products"
          value={stats.products}
          sub={`${stats.adLinks} ad links`}
          accent="blue"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 lg:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Recent resellers</h2>
            <Link
              href="/admin/resellers"
              className="text-xs font-semibold text-violet-600 hover:underline"
            >
              View all
            </Link>
          </div>
          {stats.recentResellers.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No resellers yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {stats.recentResellers.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-500">
                      {r.storeName ?? r.email}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-violet-700">
                      {AI_PLANS[r.plan as PlanId]?.name ?? r.plan}
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.aiUsed}/{r.aiLimit} AI
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 lg:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Recent orders</h2>
            <Link
              href="/admin/orders"
              className="text-xs font-semibold text-violet-600 hover:underline"
            >
              View all
            </Link>
          </div>
          {stats.recentOrders.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No orders yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {stats.recentOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {o.orderNumber ?? o.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-slate-500">{o.storeName ?? "—"}</p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700">
                      {o.status}
                    </span>
                    {o.total != null && (
                      <p className="mt-1 text-xs font-medium text-slate-700">
                        {formatMoney(o.total, o.currency ?? currency)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 lg:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Recent Conversations</h2>
            <Link
              href="/admin/chats"
              className="text-xs font-semibold text-violet-600 hover:underline"
            >
              View all
            </Link>
          </div>
          {stats.recentChats.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No chats yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {stats.recentChats.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      +{c.phone}
                    </p>
                    <p className="text-xs text-slate-500">{c.storeName ?? "—"}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700">
                    {c.status.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
