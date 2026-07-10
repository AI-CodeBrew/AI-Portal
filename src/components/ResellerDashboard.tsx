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
  const share = stats.shareLink;
  const hasTraffic = stats.chart.some(
    (p) => p.conversations > 0 || p.orders > 0
  );
  const currency = stats.period.revenue.currency || stats.store.currency || "AED";

  async function copyTrackingLink() {
    if (!share?.trackingUrl) return;
    try {
      await navigator.clipboard.writeText(share.trackingUrl);
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
                Share a product link to start collecting conversations and orders.
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
        {/* Share product link */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h3 className="font-bold text-slate-900">Share Product Link</h3>
          <p className="text-xs text-slate-500">
            Use this on your ad&apos;s Shop Now button
          </p>
          {share ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Product
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {share.productTitle}
                </p>
                {share.price && (
                  <p className="text-xs text-slate-500">
                    {share.price} {share.currency ?? ""} · {share.clickCount} clicks
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tracking Link
                </p>
                <p className="mt-1 break-all rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
                  {share.trackingUrl}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyTrackingLink}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <a
                  href={share.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open
                </a>
                {share.whatsappUrl && (
                  <a
                    href={share.whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    Share
                  </a>
                )}
                <a
                  href={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(share.trackingUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  QR
                </a>
                <Link
                  href="/dashboard/ads"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  All links
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <p className="text-sm text-slate-600">
                No product links yet. Add a product to generate a tracking link.
              </p>
              <Link
                href="/dashboard/products"
                className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline"
              >
                Add product →
              </Link>
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
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md"
          >
            <p className="text-sm font-semibold text-slate-900">Integrations</p>
            <p className="mt-1 text-xs text-slate-500">Shopify & WhatsApp</p>
          </Link>
          <Link
            href="/dashboard/ai"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md"
          >
            <p className="text-sm font-semibold text-slate-900">AI Settings</p>
            <p className="mt-1 text-xs text-slate-500">Agent name & templates</p>
          </Link>
          <Link
            href="/dashboard/ads"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md"
          >
            <p className="text-sm font-semibold text-slate-900">Ad Links</p>
            <p className="mt-1 text-xs text-slate-500">
              {stats.ads.linkCount} links · {stats.ads.totalClicks} clicks
            </p>
          </Link>
          <Link
            href="/dashboard/plan"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md"
          >
            <p className="text-sm font-semibold text-slate-900">Plan & Usage</p>
            <p className="mt-1 text-xs text-slate-500">
              {stats.ai.percentUsed}% of monthly AI quota
            </p>
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
