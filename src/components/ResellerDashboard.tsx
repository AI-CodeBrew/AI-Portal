"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import type {
  PeriodMetric,
  ResellerDashboardStats,
} from "@/lib/dashboard/reseller-stats";
import {
  cachedJsonFetch,
  peekCachedJson,
} from "@/lib/client-fetch-cache";

function formatDelta(metric: PeriodMetric, suffix = "%"): string {
  if (metric.deltaPercent == null) {
    return metric.current > 0 ? `New vs last 7 days` : `vs last 7 days`;
  }
  const sign = metric.deltaPercent > 0 ? "+" : "";
  return `${sign}${metric.deltaPercent}${suffix} vs last 7 days`;
}

function deltaColor(metric: PeriodMetric): string {
  if (metric.deltaPercent == null) return "text-slate-500";
  if (metric.deltaPercent > 0) return "text-emerald-600";
  if (metric.deltaPercent < 0) return "text-red-600";
  return "text-slate-500";
}

function StatCard({
  label,
  value,
  metric,
  href,
  accent = "slate",
}: {
  label: string;
  value: string | number;
  metric?: PeriodMetric;
  href?: string;
  accent?: "blue" | "emerald" | "amber" | "violet" | "slate";
}) {
  const accentBorder = {
    blue: "border-l-blue-500",
    emerald: "border-l-emerald-500",
    amber: "border-l-amber-500",
    violet: "border-l-violet-500",
    slate: "border-l-slate-300",
  }[accent];

  const inner = (
    <div
      className={`rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm md:p-5 ${accentBorder} ${
        href ? "transition-shadow hover:shadow-md" : ""
      }`}
    >
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 lg:text-3xl">{value}</p>
      {metric && (
        <p className={`mt-1 text-xs font-medium ${deltaColor(metric)}`}>
          {formatDelta(metric)}
        </p>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

function MiniBarChart({
  points,
}: {
  points: ResellerDashboardStats["chart"];
}) {
  const max = Math.max(
    1,
    ...points.map((p) => Math.max(p.conversations, p.orders))
  );

  return (
    <div className="mt-4">
      <div className="flex h-28 items-end gap-1.5 md:h-36 md:gap-2 lg:h-40">
        {points.map((p) => (
          <div key={p.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex h-20 w-full items-end justify-center gap-0.5 md:h-28 lg:h-32">
              <div
                className="w-2 rounded-t bg-blue-400/90 md:w-2.5"
                style={{
                  height: `${Math.max(4, (p.conversations / max) * 100)}%`,
                }}
                title={`${p.conversations} conversations`}
              />
              <div
                className="w-2 rounded-t bg-emerald-500 md:w-2.5"
                style={{ height: `${Math.max(4, (p.orders / max) * 100)}%` }}
                title={`${p.orders} orders`}
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

function OrderStatusBars({
  pending,
  confirmed,
  cancelled,
}: {
  pending: number;
  confirmed: number;
  cancelled: number;
}) {
  const total = pending + confirmed + cancelled;
  const rows = [
    { label: "Pending", value: pending, color: "bg-amber-400" },
    { label: "Confirmed", value: confirmed, color: "bg-emerald-500" },
    { label: "Cancelled", value: cancelled, color: "bg-slate-300" },
  ];

  return (
    <div className="mt-4 space-y-3">
      {rows.map((row) => {
        const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;
        return (
          <div key={row.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-slate-700">{row.label}</span>
              <span className="text-slate-500">
                {row.value} · {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${row.color}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      {total === 0 && (
        <p className="text-sm text-slate-500">No orders yet</p>
      )}
    </div>
  );
}

const DASHBOARD_STATS_KEY = "dashboard:stats";

export function ResellerDashboard() {
  const cached = peekCachedJson<{ stats?: ResellerDashboardStats; error?: string }>(
    DASHBOARD_STATS_KEY
  );
  const [stats, setStats] = useState<ResellerDashboardStats | null>(
    cached?.stats ?? null
  );
  const [loading, setLoading] = useState(!cached?.stats);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void cachedJsonFetch<{ stats?: ResellerDashboardStats; error?: string }>(
      DASHBOARD_STATS_KEY,
      "/api/dashboard/stats",
      { ttlMs: 45_000, staleWhileRevalidate: true }
    )
      .then(({ data }) => {
        if (data.error) throw new Error(data.error);
        if (data.stats) setStats(data.stats);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Loading dashboard...
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {error ?? "Could not load dashboard"}
      </div>
    );
  }

  const hasTraffic = stats.chart.some(
    (p) => p.conversations > 0 || p.orders > 0
  );
  const currency = stats.period.revenue.currency || stats.store.currency || "AED";

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6 lg:p-8">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Welcome back, {stats.store.name}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {stats.store.shop_domain ??
              "Complete setup to start selling on WhatsApp"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                stats.store.shopify_connected
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Shopify {stats.store.shopify_connected ? "on" : "off"}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                stats.store.whatsapp_connected
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              WhatsApp {stats.store.whatsapp_connected ? "on" : "off"}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                stats.store.meta_connected
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Meta {stats.store.meta_connected ? "on" : "off"}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                stats.ai.platformConfigured
                  ? "bg-blue-100 text-blue-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              AI {stats.ai.platformConfigured ? "active" : "not configured"}
            </span>
          </div>
        </div>
      </div>

      {/* 7-day KPIs */}
      <div className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-5">
        <StatCard
          label="Total Conversations"
          value={stats.period.conversations.current.toLocaleString()}
          metric={stats.period.conversations}
          href="/dashboard/inbox"
          accent="blue"
        />
        <StatCard
          label="Orders Created"
          value={stats.period.ordersCreated.current.toLocaleString()}
          metric={stats.period.ordersCreated}
          href="/dashboard/orders"
          accent="slate"
        />
        <StatCard
          label="Confirmed Orders"
          value={stats.period.confirmedOrders.current.toLocaleString()}
          metric={stats.period.confirmedOrders}
          href="/dashboard/orders"
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
          metric={stats.period.revenue}
          href="/dashboard/orders"
          accent="amber"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Chart */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 lg:col-span-2 lg:p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900">Conversations & Orders</h3>
              <p className="text-xs text-slate-500">Last 7 days</p>
            </div>
            <Link
              href="/dashboard/inbox"
              className="shrink-0 text-xs font-semibold text-blue-600 hover:underline"
            >
              View inbox
            </Link>
          </div>
          {hasTraffic ? (
            <MiniBarChart points={stats.chart} />
          ) : (
            <div className="mt-8 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">No traffic yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Conversations and orders from the last 7 days will show here.
              </p>
            </div>
          )}
        </div>

        {/* Order status */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 lg:p-6">
          <h3 className="font-bold text-slate-900">Order Status</h3>
          <p className="text-xs text-slate-500">All time</p>
          <OrderStatusBars
            pending={stats.orderStatus.pending}
            confirmed={stats.orderStatus.confirmed}
            cancelled={stats.orderStatus.cancelled}
          />
          <p className="mt-4 text-xs text-slate-500">
            Total orders: {stats.orders.total.toLocaleString()}
            {stats.orders.shopifyTotal != null
              ? ` · ${stats.orders.shopifyTotal.toLocaleString()} on Shopify`
              : ""}
          </p>
        </div>
      </div>

      <Link
        href="/dashboard/plan"
        className="group relative block w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-300 hover:shadow-md md:p-6"
      >
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-50 transition group-hover:scale-110" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-slate-900 md:text-base">
                  Plan & Growth
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    stats.ai.limitReached
                      ? "bg-red-100 text-red-800"
                      : stats.ai.percentUsed >= 80
                        ? "bg-amber-100 text-amber-900"
                        : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {stats.ai.percentUsed}% used
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 md:text-sm">
                {stats.ai.planName} plan · AI replies · View usage & upgrade
              </p>
            </div>
          </div>

          <div className="w-full min-w-0 sm:max-w-md sm:flex-1 lg:max-w-lg">
            <div className="mb-1.5 flex justify-between text-[11px] md:text-xs">
              <span className="font-medium text-slate-600">
                {stats.ai.used.toLocaleString()} used
              </span>
              <span className="text-slate-500">
                {stats.ai.limit.toLocaleString()} limit
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${
                  stats.ai.limitReached
                    ? "bg-red-500"
                    : stats.ai.percentUsed >= 80
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                }`}
                style={{
                  width: `${Math.min(100, stats.ai.percentUsed)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </Link>

      {stats.ai.limitReached && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">AI monthly limit reached</p>
          <p className="mt-1">
            New WhatsApp messages won&apos;t get AI replies until next month or
            you upgrade your plan. Contact your administrator to upgrade.
          </p>
        </div>
      )}
    </div>
  );
}
