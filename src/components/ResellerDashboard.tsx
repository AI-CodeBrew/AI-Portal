"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import type {
  PeriodMetric,
  ResellerDashboardStats,
} from "@/lib/dashboard/reseller-stats";

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
      className={`rounded-xl border border-slate-200 border-l-4 bg-white p-5 shadow-sm ${accentBorder} ${
        href ? "transition-shadow hover:shadow-md" : ""
      }`}
    >
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
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

function ProgressRing({ percent }: { percent: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;

  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96">
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="8"
        />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke="#10b981"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-slate-900">
        {percent}%
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    confirmed: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-slate-100 text-slate-600",
    ai_handling: "bg-blue-100 text-blue-800",
    human_handoff: "bg-violet-100 text-violet-800",
    closed: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
        styles[status] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
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
      <div className="flex h-40 items-end gap-2">
        {points.map((p) => (
          <div key={p.date} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-32 w-full items-end justify-center gap-0.5">
              <div
                className="w-2.5 rounded-t bg-blue-400/90"
                style={{
                  height: `${Math.max(4, (p.conversations / max) * 100)}%`,
                }}
                title={`${p.conversations} conversations`}
              />
              <div
                className="w-2.5 rounded-t bg-emerald-500"
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

export function ResellerDashboard() {
  const [stats, setStats] = useState<ResellerDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setStats(data.stats);
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

  const nextStep = stats.setup.steps.find((s) => !s.done);
  const recentSkus = stats.recentSkus ?? [];
  const hasTraffic = stats.chart.some(
    (p) => p.conversations > 0 || p.orders > 0
  );
  const currency = stats.period.revenue.currency || stats.store.currency || "AED";

  async function copySku(sku: string) {
    try {
      await navigator.clipboard.writeText(sku);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="text-center">
            <ProgressRing percent={stats.setup.percentComplete} />
            <p className="mt-2 text-xs font-medium text-slate-500">
              {stats.setup.completedCount}/{stats.setup.totalCount} completed
            </p>
          </div>
        </div>

        {stats.setup.percentComplete < 100 && nextStep && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-sm font-semibold text-emerald-900">Next step</p>
            <p className="mt-1 text-sm text-emerald-800">{nextStep.label}</p>
            <p className="text-xs text-emerald-700/80">{nextStep.description}</p>
            <Link
              href={nextStep.href}
              className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline"
            >
              Continue setup →
            </Link>
          </div>
        )}
      </div>

      {/* 7-day KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Conversations & Orders</h3>
              <p className="text-xs text-slate-500">Last 7 days</p>
            </div>
            <Link
              href="/dashboard/inbox"
              className="text-xs font-semibold text-blue-600 hover:underline"
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
                Share a product SKU in ads or WhatsApp so the AI can identify it.
              </p>
              <Link
                href="/dashboard/products"
                className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline"
              >
                Add a product →
              </Link>
            </div>
          )}
        </div>

        {/* Order status */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top products */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Top Products</h3>
            <Link
              href="/dashboard/products"
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Manage
            </Link>
          </div>
          {stats.topProducts.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No sales yet</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {stats.topProducts.map((p, i) => (
                <li key={p.title} className="flex items-center gap-3 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {p.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {p.orders} orders · {p.quantity} units
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-slate-700">
                    {formatMoney(p.revenue, currency)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent conversations */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Recent Conversations</h3>
            <Link
              href="/dashboard/inbox"
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>
          {stats.inbox.recent.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No chats yet</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {stats.inbox.recent.map((chat) => (
                <li key={chat.id} className="py-3 first:pt-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        +{chat.customer_phone}
                      </p>
                      {chat.last_message && (
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {chat.last_message}
                        </p>
                      )}
                    </div>
                    <StatusPill status={chat.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* AI Performance */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">AI Performance</h3>
          <p className="text-xs text-slate-500">All conversations</p>
          <div className="mt-4 flex items-end gap-3">
            <p className="text-4xl font-bold text-slate-900">
              {stats.aiPerformance.successRate}%
            </p>
            <p className="mb-1 text-sm font-medium text-slate-600">AI Success</p>
          </div>
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
          <p className="mt-3 text-xs text-slate-500">
            AI replies used: {stats.ai.used}/{stats.ai.limit} ({stats.ai.planName})
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Product SKUs */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-900">Product SKUs</h3>
              <p className="text-xs text-slate-500">
                Unique SKUs the AI uses to identify products (
                <code className="text-[10px]">ref: SKU</code>)
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/dashboard/ads"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Shopify products
              </Link>
              <Link
                href="/dashboard/products"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Catalog
              </Link>
            </div>
          </div>

          {recentSkus.length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-100">
              {recentSkus.map((item) => (
                <li
                  key={`${item.source}-${item.sku}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {item.title}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-emerald-700">
                      {item.sku}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                      {item.source === "shopify" ? "Shopify" : "Catalog"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copySku(item.sku)}
                    className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    {copied ? "Copied" : "Copy SKU"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <p className="text-sm text-slate-600">
                No product SKUs yet. Add a catalog product or open a Shopify
                product and click Get product SKU.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-3">
                <Link
                  href="/dashboard/products"
                  className="text-sm font-semibold text-emerald-700 hover:underline"
                >
                  Add catalog product →
                </Link>
                <Link
                  href="/dashboard/ads"
                  className="text-sm font-semibold text-blue-700 hover:underline"
                >
                  Browse Shopify →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Onboarding */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Onboarding Progress</h3>
            <span className="text-xs font-semibold text-slate-500">
              {stats.setup.completedCount}/{stats.setup.totalCount} completed
            </span>
          </div>
          <ul className="mt-4 space-y-3">
            {stats.setup.steps.map((step) => (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className="flex items-start gap-3 rounded-lg p-1.5 -mx-1.5 hover:bg-slate-50"
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      step.done
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {step.done ? "✓" : ""}
                  </span>
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        step.done ? "text-emerald-800" : "text-slate-800"
                      }`}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-slate-500">{step.description}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Recent orders + quick actions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Recent orders</h3>
            <Link
              href="/dashboard/orders"
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>
          {stats.orders.recent.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No orders yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {stats.orders.recent.map((order) => (
                <li key={order.id} className="py-3 first:pt-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {order.order_number ?? order.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {order.customer_name ?? "Customer"} ·{" "}
                        {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <StatusPill status={order.status} />
                      {order.total != null && (
                        <p className="mt-1 text-xs font-medium text-slate-700">
                          {formatMoney(order.total, order.currency ?? currency)}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/dashboard/integrations"
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
          >
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-50 transition group-hover:scale-110" />
            <div className="relative flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">Integrations</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Connect Shopify & WhatsApp
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      stats.store.shopify_connected
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        stats.store.shopify_connected
                          ? "bg-emerald-500"
                          : "bg-slate-400"
                      }`}
                    />
                    Shopify {stats.store.shopify_connected ? "on" : "off"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      stats.store.whatsapp_connected
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        stats.store.whatsapp_connected
                          ? "bg-emerald-500"
                          : "bg-slate-400"
                      }`}
                    />
                    WhatsApp {stats.store.whatsapp_connected ? "on" : "off"}
                  </span>
                </div>
              </div>
            </div>
          </Link>

          <Link
            href="/dashboard/ai"
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300 hover:shadow-md"
          >
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-violet-50 transition group-hover:scale-110" />
            <div className="relative flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">AI Settings</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Sales & confirmation agent modes
                </p>
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-600">AI success</span>
                    <span className="font-semibold text-violet-700">
                      {stats.aiPerformance.successRate}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-violet-100">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-all"
                      style={{
                        width: `${Math.min(100, stats.aiPerformance.successRate)}%`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {stats.aiPerformance.handledByAi} AI ·{" "}
                    {stats.aiPerformance.humanTakeover} human
                  </p>
                </div>
              </div>
            </div>
          </Link>

          <Link
            href="/dashboard/ads"
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-blue-50 transition group-hover:scale-110" />
            <div className="relative flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">
                  Shopify Products
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Catalog SKUs & product details
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-blue-50/80 px-2.5 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-blue-600/80">
                      SKUs / links
                    </p>
                    <p className="mt-0.5 text-lg font-bold text-blue-900">
                      {stats.ads.linkCount}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Clicks
                    </p>
                    <p className="mt-0.5 text-lg font-bold text-slate-900">
                      {stats.ads.totalClicks}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          <Link
            href="/dashboard/plan"
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-300 hover:shadow-md"
          >
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-50 transition group-hover:scale-110" />
            <div className="relative flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Plan & Usage
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {stats.ai.planName} plan · AI replies
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      stats.ai.limitReached
                        ? "bg-red-100 text-red-800"
                        : stats.ai.percentUsed >= 80
                          ? "bg-amber-100 text-amber-900"
                          : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {stats.ai.percentUsed}%
                  </span>
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className="font-medium text-slate-600">
                      {stats.ai.used.toLocaleString()} used
                    </span>
                    <span className="text-slate-500">
                      {stats.ai.limit.toLocaleString()} limit
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
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
                  <p className="mt-1.5 text-[10px] text-slate-500">
                    Top up credits anytime — even on Basic
                  </p>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>

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
