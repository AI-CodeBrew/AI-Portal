"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  type AiLlmProvider,
  type PlatformLlmAdminView,
} from "@/lib/platform/llm-settings";

export function AdminLlmProviderPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<PlatformLlmAdminView | null>(null);

  const [provider, setProvider] = useState<AiLlmProvider>("groq");
  const [geminiModel, setGeminiModel] = useState(DEFAULT_GEMINI_MODEL);
  const [groqModel, setGroqModel] = useState(DEFAULT_GROQ_MODEL);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [groqApiKey, setGroqApiKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/llm-settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const s = data.settings as PlatformLlmAdminView;
      setSettings(s);
      setProvider(s.provider);
      setGeminiModel(s.geminiModel || DEFAULT_GEMINI_MODEL);
      setGroqModel(s.groqModel || DEFAULT_GROQ_MODEL);
      setGeminiApiKey("");
      setGroqApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(extra?: {
    clearGeminiApiKey?: boolean;
    clearGroqApiKey?: boolean;
  }) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/llm-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          geminiModel: geminiModel.trim() || DEFAULT_GEMINI_MODEL,
          groqModel: groqModel.trim() || DEFAULT_GROQ_MODEL,
          ...(geminiApiKey.trim() ? { geminiApiKey: geminiApiKey.trim() } : {}),
          ...(groqApiKey.trim() ? { groqApiKey: groqApiKey.trim() } : {}),
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSettings(data.settings);
      setGeminiApiKey("");
      setGroqApiKey("");
      setSuccess(
        extra?.clearGroqApiKey
          ? "Groq API key removed from portal."
          : extra?.clearGeminiApiKey
            ? "Gemini API key removed from portal."
            : "LLM settings saved."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Loading LLM settings...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">Sales LLM provider</h2>
      <p className="mt-1 text-sm text-slate-500">
        Choose Groq or Google Gemini for WhatsApp sales AI. API keys are stored
        encrypted in the portal. Server env vars (
        <code className="rounded bg-slate-100 px-1">GROQ_API_KEY</code>,{" "}
        <code className="rounded bg-slate-100 px-1">GEMINI_API_KEY</code>) still
        work as fallback when no portal key is saved.
      </p>

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

      <div className="mt-5 space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Active provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as AiLlmProvider)}
            className="mt-1 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
          >
            <option value="groq">Groq (Llama)</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </label>

        <div className="flex flex-wrap gap-3 text-xs">
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${
              settings?.hasGroqApiKey
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-900"
            }`}
          >
            Groq:{" "}
            {settings?.hasGroqApiKey
              ? settings.groqFromEnv
                ? `env ${settings.groqApiKeyMasked ?? ""}`
                : `portal ${settings.groqApiKeyMasked ?? "saved"}`
              : "not set"}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${
              settings?.hasGeminiApiKey
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            Gemini:{" "}
            {settings?.hasGeminiApiKey
              ? settings.geminiFromEnv
                ? `env ${settings.geminiApiKeyMasked ?? ""}`
                : `portal ${settings.geminiApiKeyMasked ?? "saved"}`
              : "not set"}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${
              settings?.configured
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            Active: {settings?.configured ? "ready" : "not ready"}
          </span>
        </div>

        {provider === "groq" && (
          <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Groq settings
            </p>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">Groq model</span>
              <input
                value={groqModel}
                onChange={(e) => setGroqModel(e.target.value)}
                className="mt-1 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                placeholder={DEFAULT_GROQ_MODEL}
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">Groq API key</span>
              <input
                type="password"
                value={groqApiKey}
                onChange={(e) => setGroqApiKey(e.target.value)}
                autoComplete="off"
                className="mt-1 w-full max-w-lg rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                placeholder={
                  settings?.hasGroqApiKey && !settings.groqFromEnv
                    ? "Leave blank to keep existing key"
                    : "Paste Groq API key from console.groq.com"
                }
              />
              <p className="mt-1 text-xs text-slate-500">
                Get a key at{" "}
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-700 underline"
                >
                  console.groq.com
                </a>
                . Stored encrypted — never commit keys to git.
              </p>
            </label>

            {settings?.hasGroqApiKey && !settings.groqFromEnv && (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  if (
                    confirm(
                      "Remove the Groq API key saved in the portal? Groq will fall back to GROQ_API_KEY env if set."
                    )
                  ) {
                    void save({ clearGroqApiKey: true });
                  }
                }}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                Disconnect Groq key
              </button>
            )}
          </div>
        )}

        {provider === "gemini" && (
          <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Gemini settings
            </p>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">Gemini model</span>
              <input
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                className="mt-1 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                placeholder={DEFAULT_GEMINI_MODEL}
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">Gemini API key</span>
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                autoComplete="off"
                className="mt-1 w-full max-w-lg rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                placeholder={
                  settings?.hasGeminiApiKey && !settings.geminiFromEnv
                    ? "Leave blank to keep existing key"
                    : "Paste Google AI / Gemini API key"
                }
              />
              <p className="mt-1 text-xs text-slate-500">
                Use{" "}
                <code className="rounded bg-slate-100 px-1">
                  gemini-3-flash-preview
                </code>{" "}
                (admin accepts{" "}
                <code className="rounded bg-slate-100 px-1">gemini-3-flash</code>{" "}
                too).
              </p>
            </label>

            {settings?.hasGeminiApiKey && !settings.geminiFromEnv && (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  if (
                    confirm(
                      "Remove the Gemini API key saved in the portal? Gemini will fall back to GEMINI_API_KEY env if set."
                    )
                  ) {
                    void save({ clearGeminiApiKey: true });
                  }
                }}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                Disconnect Gemini key
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => save()}
          disabled={saving}
          className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save LLM settings"}
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
