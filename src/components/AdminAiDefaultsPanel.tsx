"use client";

import { useCallback, useEffect, useState } from "react";
import {
  REPLY_LENGTH_OPTIONS,
  TONE_OPTIONS,
  type AiReplyLength,
  type AiTone,
} from "@/lib/ai/ai-settings-types";
import type { PlatformAiDefaults } from "@/lib/ai/platform-defaults";

export function AdminAiDefaultsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<PlatformAiDefaults | null>(null);

  const [agentName, setAgentName] = useState("Max");
  const [tone, setTone] = useState<AiTone>("friendly");
  const [replyLength, setReplyLength] = useState<AiReplyLength>("medium");
  const [openingMessage, setOpeningMessage] = useState("");
  const [platformName, setPlatformName] = useState("Arabia AI");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-defaults");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const s = data.settings as PlatformAiDefaults;
      setSettings(s);
      setAgentName(s.agentName ?? "Max");
      setTone(s.tone ?? "friendly");
      setReplyLength(s.replyLength ?? "medium");
      setOpeningMessage(s.openingMessage ?? "");
      setPlatformName(s.platformName ?? "Arabia AI");
      setSupportEmail(s.supportEmail ?? "");
      setSupportPhone(s.supportPhone ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/ai-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName: agentName || null,
          tone,
          replyLength,
          openingMessage: openingMessage || null,
          platformName: platformName || null,
          supportEmail: supportEmail || null,
          supportPhone: supportPhone || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSettings(data.settings);
      setSuccess("Defaults saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Loading AI defaults...
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">
            Default AI persona
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            What new resellers inherit at signup
          </p>

          <div className="mt-5 space-y-4">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Default AI name</span>
              <input
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                placeholder="Max"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">Default tone</span>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as AiTone)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              >
                {TONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                Default response length
              </span>
              <select
                value={replyLength}
                onChange={(e) =>
                  setReplyLength(e.target.value as AiReplyLength)
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              >
                {REPLY_LENGTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value === "short"
                      ? "Short"
                      : opt.value === "medium"
                        ? "Medium"
                        : "Long"}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                Default opening message
              </span>
              <textarea
                value={openingMessage}
                onChange={(e) => setOpeningMessage(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                placeholder="Hi! Welcome to {{brand}} 👋 How can I help?"
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Branding</h2>
          <p className="mt-1 text-sm text-slate-500">
            Shown to resellers and customers
          </p>

          <div className="mt-5 space-y-4">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Platform name</span>
              <input
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                placeholder="Arabia AI"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">Support email</span>
              <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                placeholder="support@arabia-ai.com"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">Support phone</span>
              <input
                type="tel"
                value={supportPhone}
                onChange={(e) => setSupportPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                placeholder="+971 4 555 0100"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save defaults"}
        </button>
        {settings?.updatedAt && (
          <p className="text-xs text-slate-500">
            Last updated {new Date(settings.updatedAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
