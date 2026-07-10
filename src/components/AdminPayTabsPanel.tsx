"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PAYTABS_REGIONS,
  type PayTabsCredentialsPublic,
  type PayTabsRegion,
  type PlanPaymentRow,
} from "@/lib/payments/paytabs";
import { formatMoney } from "@/lib/currency";

export function AdminPayTabsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [credentials, setCredentials] =
    useState<PayTabsCredentialsPublic | null>(null);
  const [payments, setPayments] = useState<PlanPaymentRow[]>([]);

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
      const res = await fetch("/api/admin/paytabs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
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
      const res = await fetch("/api/admin/paytabs", {
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
      setSuccess(
        "PayTabs connected. Resellers can now select a plan and start checkout."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect platform PayTabs? Resellers will not be able to checkout."))
      return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/paytabs", {
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

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Loading PayTabs...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
        <p className="text-sm font-semibold text-violet-900">How billing works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-violet-800/90">
          <li>You connect PayTabs once here (platform merchant account)</li>
          <li>Resellers open Plan & Usage and select Pro or Max</li>
          <li>PayTabs checkout opens — they pay</li>
          <li>
            Callback activates their plan (API wiring next — flow is ready)
          </li>
        </ol>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Platform PayTabs
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Merchant credentials for AI plan purchases across all resellers.
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

        <form
          onSubmit={saveCredentials}
          className="mt-6 grid gap-4 sm:grid-cols-2"
        >
          <label className="block text-sm">
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
              Server Key{" "}
              {credentials?.hasServerKey ? "(leave blank to keep)" : ""}
            </span>
            <input
              type="password"
              value={serverKey}
              onChange={(e) => setServerKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={
                credentials?.hasServerKey
                  ? "••••••••"
                  : "From PayTabs dashboard"
              }
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Client Key (optional)
            </span>
            <input
              value={clientKey}
              onChange={(e) => setClientKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Merchant email</span>
            <input
              type="email"
              value={merchantEmail}
              onChange={(e) => setMerchantEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
              Test mode (sandbox)
            </span>
          </label>

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
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
        <h3 className="font-bold text-slate-900">Reseller plan payments</h3>
        <p className="mt-1 text-sm text-slate-600">
          Checkout attempts from all resellers.
        </p>
        {payments.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No payments yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {payments.map((p) => {
              const store = Array.isArray(p.stores) ? p.stores[0] : p.stores;
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold capitalize text-slate-900">
                      {p.plan_id} ·{" "}
                      {store?.store_name || store?.shop_domain || "Store"}
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
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
