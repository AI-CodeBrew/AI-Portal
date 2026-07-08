"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import type { AdminPlatformStats } from "@/lib/admin/stats";
import { AI_PLANS, type PlanId } from "@/lib/ai/plans";

function StatCard({
  label,
  value,
  sub,
  href,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
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
      className={`rounded-xl border border-slate-200 border-l-4 bg-white p-5 shadow-sm ${border}`}
    >
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
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

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Resellers"
          value={stats.resellers}
          sub="Registered accounts"
          href="/admin/resellers"
          accent="violet"
        />
        <StatCard
          label="Total orders"
          value={stats.orders.total}
          sub={`${stats.orders.pending} pending`}
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

      <div className="grid gap-4 sm:grid-cols-3">
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
          label="Ad links created"
          value={stats.adLinks}
          accent="violet"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
                        {formatMoney(o.total, o.currency ?? "USD")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
