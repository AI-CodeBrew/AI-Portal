"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  PAYTABS_REGIONS,
  PLAN_PRICES_AED,
  type PayTabsCredentialsPublic,
  type PayTabsRegion,
} from "@/lib/payments/paytabs";
import { AI_PLANS, PLAN_ORDER, type PlanId } from "@/lib/ai/plans";
import { formatMoney } from "@/lib/currency";

type PaymentRow = {
  id: string;
  plan_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  paytabs_cart_id: string | null;
};

export function PayTabsIntegrationPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [credentials, setCredentials] =
    useState<PayTabsCredentialsPublic | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const [profileId, setProfileId] = useState("");
  const [serverKey, setServerKey] = useState("");
  const [clientKey, setClientKey] = useState("");
  const [merchantEmail, setMerchantEmail] = useState("");
  const [region, setRegion] = useState<PayTabsRegion>("ARE");
  const [currency, setCurrency] = useState("AED");
  const [testMode, setTestMode] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/store/paytabs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load PayTabs");
      const creds = data.credentials as PayTabsCredentialsPublic;
      setCredentials(creds);
      setPayments(data.payments ?? []);
      setProfileId(creds.profileId ?? "");
      setClientKey(creds.clientKey ?? "");
      setMerchantEmail(creds.merchantEmail ?? "");
      setRegion(creds.region ?? "ARE");
      setCurrency(creds.currency ?? "AED");
      setTestMode(creds.testMode !== false);
      setServerKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveCredentials(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/store/paytabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          profileId,
          serverKey: serverKey || undefined,
          clientKey: clientKey || null,
          merchantEmail: merchantEmail || null,
          region,
          currency,
          testMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setCredentials(data.credentials);
      setServerKey("");
      setSuccess("PayTabs credentials saved. Checkout API can be wired next.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect PayTabs from this store?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/store/paytabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Disconnect failed");
      setSuccess("PayTabs disconnected.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setSaving(false);
    }
  }

  async function startCheckout(planId: PlanId) {
    setCheckoutLoading(planId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/store/paytabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkout", planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      setSuccess(data.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setCheckoutLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Loading PayTabs...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">PayTabs</h2>
            <p className="mt-1 text-sm text-slate-600">
              Connect PayTabs so you can buy AI reply plans (Pro / Max). The
              hosted payment API will be wired later — save credentials now.
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              credentials?.connected
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {credentials?.connected ? "Connected" : "Not connected"}
          </span>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {success}
          </div>
        )}

        <form onSubmit={saveCredentials} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-1">
            <span className="font-medium text-slate-700">Profile ID</span>
            <input
              required
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="e.g. 123456"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Server Key {credentials?.hasServerKey ? "(leave blank to keep)" : ""}
            </span>
            <input
              type="password"
              value={serverKey}
              onChange={(e) => setServerKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={
                credentials?.hasServerKey ? "••••••••" : "From PayTabs dashboard"
              }
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Client Key (optional)</span>
            <input
              value={clientKey}
              onChange={(e) => setClientKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="For client-side widgets later"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Merchant email</span>
            <input
              type="email"
              value={merchantEmail}
              onChange={(e) => setMerchantEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="billing@yourstore.com"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Region</span>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as PayTabsRegion)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {PAYTABS_REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Currency</span>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="AED"
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span className="font-medium text-slate-700">
              Test mode (sandbox) — recommended until live
            </span>
          </label>

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save PayTabs credentials"}
            </button>
            {credentials?.connected && (
              <button
                type="button"
                onClick={disconnect}
                disabled={saving}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Disconnect
              </button>
            )}
            <a
              href="https://support.paytabs.com/en/support/solutions/articles/60000708841-how-to-get-my-profile-id-and-server-key-"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Where to find keys
            </a>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="font-bold text-slate-900">Buy AI plan</h3>
        <p className="mt-1 text-sm text-slate-600">
          Flow is ready: selecting a plan creates a pending payment record.
          Hosted PayTabs checkout will open here once the API is connected.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {PLAN_ORDER.map((id) => {
            const plan = AI_PLANS[id];
            const price = PLAN_PRICES_AED[id];
            return (
              <div
                key={id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <p className="font-bold text-slate-900">{plan.name}</p>
                <p className="mt-1 text-lg font-bold text-emerald-700">
                  {price === 0
                    ? "Free"
                    : formatMoney(price, currency || "AED")}
                  <span className="text-xs font-normal text-slate-500">
                    {" "}
                    / month
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-500">{plan.description}</p>
                {id === "basic" ? (
                  <p className="mt-3 text-xs font-medium text-slate-500">
                    Included by default
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={!credentials?.connected || checkoutLoading === id}
                    onClick={() => startCheckout(id)}
                    className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {checkoutLoading === id
                      ? "Starting..."
                      : credentials?.connected
                        ? "Request checkout"
                        : "Connect PayTabs first"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Or manage usage on{" "}
          <Link href="/dashboard/plan" className="font-semibold text-emerald-700 hover:underline">
            Plan & Usage
          </Link>
          .
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 p-5">
        <p className="text-sm font-semibold text-amber-900">Setup checklist</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-amber-900/90">
          <li>Create a PayTabs merchant account for your region</li>
          <li>Copy Profile ID + Server Key from the PayTabs dashboard</li>
          <li>Save credentials here (Server Key is encrypted at rest)</li>
          <li>Use “Request checkout” to create a pending plan payment</li>
          <li>
            Later: we will call PayTabs payment request API and handle the
            return / callback webhook to activate the plan automatically
          </li>
        </ol>
      </div>

      {payments.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">Recent plan payments</h3>
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
                    {p.paytabs_cart_id ? ` · ${p.paytabs_cart_id}` : ""}
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
