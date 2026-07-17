"use client";

import { useCallback, useEffect, useState } from "react";
import { PlanUsageCard } from "@/components/PlanUsageCard";
import { AI_PLANS, PLAN_ORDER, PLAN_PRICES_AED, type PlanId } from "@/lib/ai/plans";
import {
  PlanFeaturesList,
  PlanPriceLabel,
} from "@/components/PlanFeaturesList";
import {
  AI_TOPUP_PACKS,
  TOPUP_PACK_ORDER,
  type TopupPackId,
} from "@/lib/ai/topup";
import { formatMoney } from "@/lib/currency";

type PaymentRow = {
  id: string;
  plan_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
};

export function ResellerBillingPanel() {
  const [available, setAvailable] = useState(false);
  const [currency, setCurrency] = useState("AED");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<PlanId | null>(null);
  const [topupLoading, setTopupLoading] = useState<TopupPackId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<PlanId>("basic");
  const [lastCheckout, setLastCheckout] = useState<{
    planName: string;
    amount: number;
    currency: string;
    paymentId: string;
    checkoutUrl: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/store/billing/checkout");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load billing");
      setAvailable(Boolean(data.billing?.available));
      setCurrency(data.billing?.currency || "AED");
      setPayments(data.payments ?? []);
      const usageRes = await fetch("/api/store/ai-usage");
      const usageData = await usageRes.json();
      if (usageData.usage?.planId) {
        setCurrentPlanId(usageData.usage.planId as PlanId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function selectPlan(planId: PlanId) {
    if (planId === "basic") return;
    setCheckoutLoading(planId);
    setError(null);
    setSuccess(null);
    setLastCheckout(null);
    try {
      const res = await fetch("/api/store/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");

      setLastCheckout({
        planName: data.planName,
        amount: data.amount,
        currency: data.currency,
        paymentId: data.paymentId,
        checkoutUrl: data.checkoutUrl,
      });

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      setSuccess(data.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function buyTopup(packId: TopupPackId) {
    if (!available) return;
    setTopupLoading(packId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/store/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Top-up failed");
      setSuccess(data.message ?? "AI credits added.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Top-up failed");
    } finally {
      setTopupLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <PlanUsageCard />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {success}
        </div>
      )}

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">
          Top up AI message credits
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Stay on Basic (or any plan) and buy extra AI replies anytime. Credits
          add to your monthly limit after PayTabs checkout completes.
        </p>
        {!loading && !available && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Online checkout is not available yet. Ask your platform admin to
            connect PayTabs under Admin → Billing.
          </div>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {TOPUP_PACK_ORDER.map((id) => {
            const pack = AI_TOPUP_PACKS[id];
            return (
              <div
                key={id}
                className="flex flex-col rounded-lg border border-slate-200 bg-white p-4"
              >
                <p className="font-bold text-slate-900">{pack.label}</p>
                <p className="mt-1 text-lg font-bold text-emerald-700">
                  {formatMoney(pack.priceAed, currency)}
                </p>
                <p className="mt-1 flex-1 text-xs text-slate-600">
                  {pack.description}
                </p>
                <button
                  type="button"
                  disabled={!available || topupLoading === id}
                  onClick={() => buyTopup(id)}
                  className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {topupLoading === id
                    ? "Opening checkout..."
                    : available
                      ? "Top up"
                      : "Checkout unavailable"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Choose a plan</h2>
        <p className="mt-1 text-sm text-slate-600">
          Compare what&apos;s included. Pay with PayTabs checkout on Growth or
          Pro, or ask your platform admin to assign Enterprise.
        </p>

        {!loading && !available && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Online checkout is not available yet. Ask your platform admin to
            connect PayTabs under Admin → Billing. Admins can still upgrade your
            plan manually.
          </div>
        )}

        {lastCheckout && !lastCheckout.checkoutUrl && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-semibold">
              Checkout ready — {lastCheckout.planName}
            </p>
            <p className="mt-1">
              Amount:{" "}
              {formatMoney(lastCheckout.amount, lastCheckout.currency)} · Ref{" "}
              {lastCheckout.paymentId.slice(0, 8)}
            </p>
            <p className="mt-2 text-xs text-blue-800/90">
              PayTabs hosted payment page will open automatically once the
              platform connects the live payment API. Your request is saved as
              pending until an admin confirms payment.
            </p>
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLAN_ORDER.map((id) => {
            const plan = AI_PLANS[id];
            const price = PLAN_PRICES_AED[id];
            const isCurrent = id === currentPlanId;
            const isPaidCheckout = plan.selfCheckout;
            const featured = id === "pro";

            return (
              <div
                key={id}
                className={`relative flex flex-col rounded-xl border p-4 ${
                  isCurrent
                    ? "border-blue-400 bg-blue-50/40 ring-1 ring-blue-200"
                    : featured
                      ? "border-emerald-300 bg-emerald-50/30"
                      : "border-slate-200 bg-white"
                }`}
              >
                {featured && !isCurrent && (
                  <span className="absolute -top-2.5 left-4 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    Popular
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    Current
                  </span>
                )}
                <p className="text-lg font-bold text-slate-900">{plan.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{plan.tagline}</p>
                <p className="mt-2 text-xl font-bold text-emerald-700">
                  <PlanPriceLabel planId={id} plan={plan} currency={currency} />
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {plan.monthlyLimit.toLocaleString()} AI replies / month
                </p>
                <div className="mt-3 flex-1">
                  <PlanFeaturesList plan={plan} compact />
                </div>
                {id === "basic" ? (
                  <p className="mt-4 text-center text-xs font-medium text-slate-500">
                    Default for new stores
                  </p>
                ) : id === "enterprise" ? (
                  <p className="mt-4 text-center text-xs leading-relaxed text-slate-600">
                    Custom pricing — your platform admin assigns this plan and
                    unlocks admin chat & unlimited products.
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={
                      !available ||
                      checkoutLoading === id ||
                      isCurrent
                    }
                    onClick={() => selectPlan(id)}
                    className="mt-4 w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isCurrent
                      ? "Current plan"
                      : checkoutLoading === id
                        ? "Opening checkout..."
                        : available
                          ? isPaidCheckout
                            ? `Upgrade · ${formatMoney(price, currency)}/mo`
                            : "Select & pay"
                          : "Checkout unavailable"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {payments.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">Your payments</h3>
          <ul className="mt-4 divide-y divide-slate-100">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between py-3 text-sm"
              >
                <div>
                  <p className="font-semibold capitalize text-slate-900">
                    {p.plan_id} plan
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(p.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700">
                    {p.status}
                  </span>
                  <p className="mt-1 text-xs font-medium text-slate-700">
                    {formatMoney(Number(p.amount), p.currency)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
