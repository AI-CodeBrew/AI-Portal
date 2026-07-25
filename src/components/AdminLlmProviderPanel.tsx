"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_GEMINI_INTENT_MODEL,
  DEFAULT_GEMINI_MODEL,
  GEMINI_INTENT_MODEL_CHOICES,
  GEMINI_SALES_MODEL_CHOICES,
  type GeminiModelChoice,
  type PlatformLlmAdminView,
} from "@/lib/platform/llm-settings";

const CUSTOM_MODEL_VALUE = "__custom__";

function modelSelectValue(modelId: string, choices: GeminiModelChoice[]): string {
  return choices.some((c) => c.id === modelId) ? modelId : CUSTOM_MODEL_VALUE;
}

function GeminiModelField({
  label,
  description,
  choices,
  modelId,
  onModelIdChange,
  defaultId,
}: {
  label: string;
  description?: string;
  choices: GeminiModelChoice[];
  modelId: string;
  onModelIdChange: (id: string) => void;
  defaultId: string;
}) {
  const selectValue = modelSelectValue(modelId, choices);
  const selectedPreset = choices.find((c) => c.id === modelId);
  const isCustom = selectValue === CUSTOM_MODEL_VALUE;

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        {description ? (
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        ) : null}
        <select
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CUSTOM_MODEL_VALUE) {
              if (!isCustom) onModelIdChange("");
            } else {
              onModelIdChange(v);
            }
          }}
          className="mt-2 w-full max-w-lg rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
        >
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
          <option value={CUSTOM_MODEL_VALUE}>Custom model ID…</option>
        </select>
      </label>

      {selectedPreset && !isCustom ? (
        <p className="text-xs text-slate-500">{selectedPreset.description}</p>
      ) : null}

      {isCustom ? (
        <input
          value={modelId}
          onChange={(e) => onModelIdChange(e.target.value)}
          placeholder={defaultId}
          className="w-full max-w-lg rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
        />
      ) : (
        <p className="font-mono text-xs text-slate-600">API id: {modelId}</p>
      )}
    </div>
  );
}

export function AdminLlmProviderPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<PlatformLlmAdminView | null>(null);

  const [geminiModel, setGeminiModel] = useState(DEFAULT_GEMINI_MODEL);
  const [geminiIntentModel, setGeminiIntentModel] = useState(
    DEFAULT_GEMINI_INTENT_MODEL
  );
  const [geminiApiKey, setGeminiApiKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/llm-settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const s = data.settings as PlatformLlmAdminView;
      setSettings(s);
      setGeminiModel(s.geminiModel || DEFAULT_GEMINI_MODEL);
      setGeminiIntentModel(s.geminiIntentModel || DEFAULT_GEMINI_INTENT_MODEL);
      setGeminiApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(extra?: { clearGeminiApiKey?: boolean }) {
    const salesModel = geminiModel.trim() || DEFAULT_GEMINI_MODEL;
    const intentModel =
      geminiIntentModel.trim() || DEFAULT_GEMINI_INTENT_MODEL;

    if (!salesModel) {
      setError("Select a sales agent model");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/llm-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geminiModel: salesModel,
          geminiIntentModel: intentModel,
          ...(geminiApiKey.trim() ? { geminiApiKey: geminiApiKey.trim() } : {}),
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSettings(data.settings);
      setGeminiModel(data.settings.geminiModel);
      setGeminiIntentModel(data.settings.geminiIntentModel);
      setGeminiApiKey("");
      setSuccess(
        extra?.clearGeminiApiKey
          ? "Gemini API key removed from portal."
          : "Gemini settings saved — model changes apply to new WhatsApp messages immediately."
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
        Loading Gemini settings...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">Google Gemini (sales AI)</h2>
      <p className="mt-1 text-sm text-slate-500">
        Connect your Gemini API key and choose which models power WhatsApp sales
        replies and intent routing. Keys are stored encrypted. Env fallback:{" "}
        <code className="rounded bg-slate-100 px-1">GEMINI_API_KEY</code>.
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
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${
              settings?.hasGeminiApiKey
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            API key:{" "}
            {settings?.hasGeminiApiKey
              ? settings.geminiFromEnv
                ? `env ${settings.geminiApiKeyMasked ?? ""}`
                : `portal ${settings.geminiApiKeyMasked ?? "saved"}`
              : "not set"}
          </span>
          <span className="rounded-full bg-violet-100 px-2.5 py-1 font-semibold text-violet-900">
            Sales: {settings?.geminiModel ?? geminiModel}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-800">
            Intent: {settings?.geminiIntentModel ?? geminiIntentModel}
          </span>
        </div>

        <div className="space-y-5 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
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
          </label>

          <GeminiModelField
            label="Sales agent model"
            description="Used for full WhatsApp replies when handlers and tools run."
            choices={GEMINI_SALES_MODEL_CHOICES}
            modelId={geminiModel}
            onModelIdChange={setGeminiModel}
            defaultId={DEFAULT_GEMINI_MODEL}
          />

          <GeminiModelField
            label="Intent router model"
            description="Classifies ambiguous messages (e.g. “yes”, “that one”) before calling handlers."
            choices={GEMINI_INTENT_MODEL_CHOICES}
            modelId={geminiIntentModel}
            onModelIdChange={setGeminiIntentModel}
            defaultId={DEFAULT_GEMINI_INTENT_MODEL}
          />

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
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => save()}
          disabled={saving}
          className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Gemini settings"}
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
