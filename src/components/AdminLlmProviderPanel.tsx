"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlatformLlmAdminView } from "@/lib/platform/llm-settings";

export function AdminLlmProviderPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PlatformLlmAdminView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/llm-settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setSettings(data.settings as PlatformLlmAdminView);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Loading Gemini status...
      </div>
    );
  }

  const connected = Boolean(settings?.configured);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">Google Gemini</h2>
      <p className="mt-1 text-sm text-slate-500">
        API key and models are set in environment variables. This panel is
        status-only.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-5 space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${
              connected
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {connected
              ? `Connected ${settings?.geminiApiKeyMasked ?? ""}`
              : "Not connected — set GEMINI_API_KEY"}
          </span>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Models (from env)
          </p>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="font-medium text-slate-700">Chat</dt>
              <dd className="mt-0.5 font-mono text-slate-900">
                {settings?.geminiChatModel ?? "—"}
              </dd>
              <dd className="text-xs text-slate-500">GEMINI_CHAT_MODEL</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Reasoning</dt>
              <dd className="mt-0.5 font-mono text-slate-900">
                {settings?.geminiReasoningModel ?? "—"}
              </dd>
              <dd className="text-xs text-slate-500">GEMINI_REASONING_MODEL</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Utility</dt>
              <dd className="mt-0.5 font-mono text-slate-900">
                {settings?.geminiUtilityModel ?? "—"}
              </dd>
              <dd className="text-xs text-slate-500">GEMINI_UTILITY_MODEL</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
