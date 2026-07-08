"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import type { ResellerDashboardStats } from "@/lib/dashboard/reseller-stats";

function StatCard({
  label,
  value,
  sub,
  href,
  accent = "slate",
}: {
  label: string;
  value: string | number;
  sub?: string;
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
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
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

export function ResellerDashboard() {
  const [stats, setStats] = useState<ResellerDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      {/* Welcome + setup progress */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Welcome back, {stats.store.name}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {stats.store.shop_domain ?? "Complete setup to start selling on WhatsApp"}
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
                  stats.ai.platformConfigured
                    ? "bg-blue-100 text-blue-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                AI {stats.ai.platformConfigured ? "active" : "not configured"}
              </span>
            </div>
          </div>
          <ProgressRing percent={stats.setup.percentComplete} />
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

      {/* Key metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pending orders"
          value={stats.orders.pending}
          sub="Need confirmation"
          href="/dashboard/orders"
          accent="amber"
        />
        <StatCard
          label="Confirmed orders"
          value={stats.orders.confirmed}
          sub={`${stats.orders.withTracking} with tracking`}
          href="/dashboard/orders"
          accent="emerald"
        />
        <StatCard
          label="Active chats"
          value={stats.inbox.ai_handling}
          sub={`${stats.inbox.human_handoff} need you`}
          href="/dashboard/inbox"
          accent="blue"
        />
        <StatCard
          label="AI replies used"
          value={`${stats.ai.used}/${stats.ai.limit}`}
          sub={`${stats.ai.planName} plan`}
          href="/dashboard/plan"
          accent={stats.ai.limitReached ? "amber" : "violet"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Setup checklist */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
          <h3 className="font-bold text-slate-900">Setup progress</h3>
          <ul className="mt-4 space-y-4">
            {stats.setup.steps.map((step) => (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className="flex items-start gap-3 rounded-lg p-2 -mx-2 hover:bg-slate-50"
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      step.done
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {step.done ? "✓" : "·"}
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

        {/* Recent orders */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
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
                          {formatMoney(order.total, order.currency ?? "USD")}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent chats */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Recent chats</h3>
            <Link
              href="/dashboard/inbox"
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Open inbox
            </Link>
          </div>
          {stats.inbox.recent.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No conversations yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {stats.inbox.recent.map((chat) => (
                <li key={chat.id} className="py-3 first:pt-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {chat.customer_phone}
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
      </div>

      {/* Quick actions + ads */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
