"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AdminWhatsAppMonitorRow,
  PlatformMetaAdminView,
} from "@/lib/platform/meta-settings";

function CopyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-1 break-all font-mono text-sm text-slate-900">
            {value}
          </p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function statusBadge(status: AdminWhatsAppMonitorRow["status"]) {
  if (status === "connected") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        Connected
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
        Pending
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
      Not Connected
    </span>
  );
}

export function AdminWhatsAppPlatformPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<PlatformMetaAdminView | null>(null);
  const [resellers, setResellers] = useState<AdminWhatsAppMonitorRow[]>([]);
  const [siteOrigin, setSiteOrigin] = useState("");

  const [metaAppId, setMetaAppId] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");
  const [metaConfigId, setMetaConfigId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/platform-whatsapp");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const s = data.settings as PlatformMetaAdminView;
      setSettings(s);
      setResellers(data.resellers ?? []);
      setMetaAppId(s.metaAppId ?? "");
      setMetaConfigId(s.metaConfigId ?? "");
      setMetaAppSecret("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSiteOrigin(window.location.origin);
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/platform-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          metaAppId,
          metaAppSecret: metaAppSecret || undefined,
          metaConfigId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSettings(data.settings);
      setMetaAppSecret("");
      setSuccess("Platform WhatsApp settings saved. Resellers can connect now.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (
      !confirm(
        "Disconnect platform Meta / WhatsApp credentials? Resellers will not be able to connect WhatsApp until you save new credentials."
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/platform-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Disconnect failed");
      setSettings(data.settings);
      setMetaAppId("");
      setMetaAppSecret("");
      setMetaConfigId("");
      setSuccess(
        "Platform Meta credentials disconnected. Enter new App ID, Secret, and Config ID, then Save."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setSaving(false);
    }
  }

  const webhookBase =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || siteOrigin;
  const webhookUrl = webhookBase
    ? `${webhookBase}/api/whatsapp-webhook`
    : "";

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Loading WhatsApp platform settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div
        className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
          settings?.configured
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-amber-200 bg-amber-50 text-amber-950"
        }`}
      >
        {settings?.configured
          ? "Platform WhatsApp integration: Configured ✅"
          : "Platform WhatsApp integration: Not configured ⚠️"}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Meta app credentials</h2>
          <p className="mt-1 text-sm text-slate-600">
            Keep the existing Meta app. App ID / App Secret come from{" "}
            <strong>Facebook Login for Business → Settings</strong>. For
            Configuration ID, create a{" "}
            <strong>WhatsApp Embedded Signup v4</strong> configuration under{" "}
            <strong>Facebook Login for Business → Configurations</strong>{" "}
            (v2/v3 configs stop working 15 Oct 2026).
          </p>
        </div>

        <form onSubmit={save} className="space-y-4 p-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {success}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Meta App ID
              </label>
              <input
                value={metaAppId}
                onChange={(e) => setMetaAppId(e.target.value)}
                placeholder="e.g. 123456789012345"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Meta App Secret
              </label>
              <input
                type="password"
                value={metaAppSecret}
                onChange={(e) => setMetaAppSecret(e.target.value)}
                placeholder={
                  settings?.hasMetaAppSecret
                    ? `Saved ${settings.metaAppSecretMasked ?? "••••••"} — leave blank to keep`
                    : "Required"
                }
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
              />
              {settings?.hasMetaAppSecret && !metaAppSecret && (
                <p className="mt-1 text-xs text-slate-500">
                  Currently saved: {settings.metaAppSecretMasked}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Embedded Signup Configuration ID
              </label>
              <input
                value={metaConfigId}
                onChange={(e) => setMetaConfigId(e.target.value)}
                placeholder="From Facebook Login for Business → Configurations (v4)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                required
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {(settings?.configured ||
              settings?.metaAppId ||
              settings?.hasMetaAppSecret) && (
              <button
                type="button"
                onClick={disconnect}
                disabled={saving}
                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {saving ? "Working..." : "Disconnect"}
              </button>
            )}
          </div>
        </form>
      </div>

      {settings?.whatsappVerifyToken && (
        <div className="overflow-hidden rounded-xl border border-blue-200 bg-blue-50/40 shadow-sm">
          <div className="border-b border-blue-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">
              Platform webhook (paste once in Meta)
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              In your Meta app → WhatsApp → Configuration → Webhook, paste the
              callback URL and verify token, subscribe to <strong>messages</strong>,
              then Verify and save.
            </p>
          </div>
          <div className="space-y-3 p-5">
            <CopyField label="Callback URL" value={webhookUrl || "…"} />
            <CopyField
              label="Verify token"
              value={settings.whatsappVerifyToken}
            />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="font-semibold text-slate-900">
            Reseller WhatsApp status
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Read-only monitoring — resellers connect from their own Integrations
            page.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                  Store
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                  Owner
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                  Phone
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resellers.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    No stores yet
                  </td>
                </tr>
              ) : (
                resellers.map((r) => (
                  <tr key={r.storeId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-800">
                      <p className="font-semibold">
                        {r.storeName || r.shopDomain || r.storeId.slice(0, 8)}
                      </p>
                      {r.shopDomain && r.storeName && (
                        <p className="text-xs text-slate-500">{r.shopDomain}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {r.ownerEmail ?? "—"}
                    </td>
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {r.displayPhone || r.phoneNumberId || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
