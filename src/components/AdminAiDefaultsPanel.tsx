"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AI_SETTING_DEFAULTS,
  REPLY_LENGTH_OPTIONS,
  TONE_OPTIONS,
  UNLIMITED_CONTEXT_VALUE,
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

  const [chatHistoryLimit, setChatHistoryLimit] = useState(
    String(AI_SETTING_DEFAULTS.chatHistoryLimit)
  );
  const [sessionWindowHours, setSessionWindowHours] = useState(
    String(AI_SETTING_DEFAULTS.sessionWindowHours)
  );
  const [unlimitedMemory, setUnlimitedMemory] = useState(false);
  const [recoveryDiscountPercent, setRecoveryDiscountPercent] = useState(
    String(AI_SETTING_DEFAULTS.recoveryDiscountPercent)
  );
  const [recoveryBundleDiscountPercent, setRecoveryBundleDiscountPercent] =
    useState(String(AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent));
  const [conversationReplyLimit, setConversationReplyLimit] = useState("");
  const [conversationReplyWindowHours, setConversationReplyWindowHours] =
    useState("");

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
      setChatHistoryLimit(
        String(s.chatHistoryLimit ?? AI_SETTING_DEFAULTS.chatHistoryLimit)
      );
      setSessionWindowHours(
        String(s.sessionWindowHours ?? AI_SETTING_DEFAULTS.sessionWindowHours)
      );
      setUnlimitedMemory(
        s.chatHistoryLimit === UNLIMITED_CONTEXT_VALUE &&
          s.sessionWindowHours === UNLIMITED_CONTEXT_VALUE
      );
      setRecoveryDiscountPercent(
        String(
          s.recoveryDiscountPercent ??
            AI_SETTING_DEFAULTS.recoveryDiscountPercent
        )
      );
      setRecoveryBundleDiscountPercent(
        String(
          s.recoveryBundleDiscountPercent ??
            AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent
        )
      );
      setConversationReplyLimit(
        s.conversationReplyLimit != null
          ? String(s.conversationReplyLimit)
          : ""
      );
      setConversationReplyWindowHours(
        s.conversationReplyWindowHours != null
          ? String(s.conversationReplyWindowHours)
          : ""
      );
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
          chatHistoryLimit: unlimitedMemory
            ? UNLIMITED_CONTEXT_VALUE
            : Number(chatHistoryLimit) || AI_SETTING_DEFAULTS.chatHistoryLimit,
          sessionWindowHours: unlimitedMemory
            ? UNLIMITED_CONTEXT_VALUE
            : Number(sessionWindowHours) ||
              AI_SETTING_DEFAULTS.sessionWindowHours,
          recoveryDiscountPercent:
            Number(recoveryDiscountPercent) ||
            AI_SETTING_DEFAULTS.recoveryDiscountPercent,
          recoveryBundleDiscountPercent:
            Number(recoveryBundleDiscountPercent) ||
            AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent,
          conversationReplyLimit:
            conversationReplyLimit.trim() === ""
              ? null
              : Number(conversationReplyLimit),
          conversationReplyWindowHours:
            conversationReplyWindowHours.trim() === ""
              ? null
              : Number(conversationReplyWindowHours),
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">
            Conversation & sales defaults
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Used when a reseller leaves these fields empty
          </p>
          <div className="mt-5 space-y-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={unlimitedMemory}
                onChange={(e) => setUnlimitedMemory(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600"
              />
              <span>
                <span className="block font-medium text-slate-800">
                  Unlimited conversation memory (default for new stores)
                </span>
                <span className="block text-xs text-slate-500">
                  Full thread context — resellers can still override per store.
                </span>
              </span>
            </label>
            {!unlimitedMemory && (
              <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                Chat history (messages)
              </span>
              <input
                type="number"
                min={5}
                max={50}
                value={chatHistoryLimit}
                onChange={(e) => setChatHistoryLimit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                Session window (hours)
              </span>
              <input
                type="number"
                min={1}
                max={168}
                value={sessionWindowHours}
                onChange={(e) => setSessionWindowHours(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              />
            </label>
              </div>
            )}
            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                First “no” discount %
              </span>
              <input
                type="number"
                min={1}
                max={90}
                value={recoveryDiscountPercent}
                onChange={(e) => setRecoveryDiscountPercent(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                Bundle discount %
              </span>
              <input
                type="number"
                min={1}
                max={90}
                value={recoveryBundleDiscountPercent}
                onChange={(e) =>
                  setRecoveryBundleDiscountPercent(e.target.value)
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">
            Default spam protection
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Applied when reseller has not set their own per-chat limits
          </p>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase text-slate-500">
              Max AI replies
              <input
                type="number"
                min={1}
                max={500}
                value={conversationReplyLimit}
                onChange={(e) => setConversationReplyLimit(e.target.value)}
                placeholder="Unlimited"
                className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase text-slate-500">
              Within (hours)
              <select
                value={conversationReplyWindowHours}
                onChange={(e) =>
                  setConversationReplyWindowHours(e.target.value)
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
              >
                <option value="">Whole chat</option>
                <option value="1">1 hour</option>
                <option value="2">2 hours</option>
                <option value="6">6 hours</option>
                <option value="12">12 hours</option>
                <option value="24">24 hours</option>
                <option value="48">48 hours</option>
                <option value="72">72 hours</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setConversationReplyLimit("");
                setConversationReplyWindowHours("");
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              Unlimited
            </button>
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
