"use client";

import { useCallback, useEffect, useState } from "react";
import {
  REPLY_LENGTH_OPTIONS,
  TEMPLATE_CATEGORY_LABELS,
  type AiPromptTemplate,
  type AiReplyLength,
  type StoreAiSettings,
} from "@/lib/ai/ai-settings-types";

type PlatformSettings = StoreAiSettings & { updatedAt: string | null };

export function AdminAiDefaultsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [templates, setTemplates] = useState<AiPromptTemplate[]>([]);

  const [agentName, setAgentName] = useState("");
  const [openingMessage, setOpeningMessage] = useState("");
  const [replyLength, setReplyLength] = useState<AiReplyLength>("medium");
  const [orderTemplateId, setOrderTemplateId] = useState<string | null>(null);
  const [generalTemplateId, setGeneralTemplateId] = useState<string | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-defaults");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const s = data.settings as PlatformSettings;
      setSettings(s);
      setTemplates(data.templates ?? []);
      setAgentName(s.agentName ?? "");
      setOpeningMessage(s.openingMessage ?? "");
      setReplyLength(s.replyLength ?? "medium");
      setOrderTemplateId(s.orderTemplateId);
      setGeneralTemplateId(s.generalTemplateId);
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
          openingMessage: openingMessage || null,
          replyLength,
          orderTemplateId,
          generalTemplateId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSettings(data.settings);
      setSuccess(
        "Platform AI defaults saved. Resellers without their own settings will use these."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const orderTemplates = templates.filter(
    (t) => t.category === "order_creation"
  );
  const generalTemplates = templates.filter((t) => t.category === "general");

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Loading AI defaults...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
        <p className="text-sm font-semibold text-violet-900">
          How defaults work
        </p>
        <p className="mt-1 text-sm text-violet-800/90">
          These settings apply to every reseller who has not set their own agent
          name, opening message, or templates. When a reseller saves AI Settings
          on their dashboard, their values override these platform defaults.
        </p>
      </div>

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

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Default AI agent</h2>
        <div className="mt-4 grid gap-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Default agent name</span>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Sales Assistant"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Default opening message
            </span>
            <textarea
              value={openingMessage}
              onChange={(e) => setOpeningMessage(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Hi! Welcome to {store_name}..."
            />
            <p className="mt-1 text-xs text-slate-500">
              Use {"{store_name}"} and {"{agent_name}"} placeholders.
            </p>
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">
              Default reply length
            </legend>
            <div className="mt-2 space-y-2">
              {REPLY_LENGTH_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                >
                  <input
                    type="radio"
                    name="replyLength"
                    checked={replyLength === opt.value}
                    onChange={() => setReplyLength(opt.value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">
                      {opt.label}
                    </span>
                    <span className="text-xs text-slate-500">
                      {opt.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Default order template
            </span>
            <select
              value={orderTemplateId ?? ""}
              onChange={(e) => setOrderTemplateId(e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {orderTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Default general template
            </span>
            <select
              value={generalTemplateId ?? ""}
              onChange={(e) => setGeneralTemplateId(e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {generalTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save platform defaults"}
          </button>
          {settings?.updatedAt && (
            <p className="text-xs text-slate-500">
              Last updated {new Date(settings.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="font-bold text-slate-900">Platform templates</h3>
        <p className="mt-1 text-sm text-slate-600">
          Predefined templates available to all resellers (read-only here —
          edit via migration / DB for now).
        </p>
        <ul className="mt-4 divide-y divide-slate-100">
          {templates.map((t) => (
            <li key={t.id} className="py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500">
                    {TEMPLATE_CATEGORY_LABELS[t.category]}
                    {t.slug ? ` · ${t.slug}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                  Platform
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
