"use client";

import { useEffect, useState } from "react";
import type { WhatsAppMessageTemplate } from "@/lib/whatsapp/message-templates";
import { previewTemplateBody } from "@/lib/whatsapp-window/template-params";

export type TemplatePickerContext = {
  customerName?: string | null;
  orderNumber?: string | null;
  marketingOptIn?: boolean | null;
};

export function TemplatePicker({
  templates,
  templateId,
  onTemplateIdChange,
  context,
  loading = false,
}: {
  templates: WhatsAppMessageTemplate[];
  templateId: string;
  onTemplateIdChange: (id: string) => void;
  context: TemplatePickerContext;
  loading?: boolean;
}) {
  const selected = templates.find((t) => t.id === templateId);

  const marketingWarning =
    selected?.category === "MARKETING" && !context.marketingOptIn;

  if (loading) {
    return <p className="text-sm text-slate-600">Loading templates...</p>;
  }

  if (templates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
        No Meta-approved templates yet. Create one under{" "}
        <strong>WA Templates</strong> and sync from Meta.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Approved template</span>
        <select
          value={templateId}
          onChange={(e) => onTemplateIdChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.language} · {t.category}
            </option>
          ))}
        </select>
      </label>

      {marketingWarning && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <strong>Marketing template:</strong> no recorded opt-in for this
          customer. Sending may fail Meta policy checks — prefer Utility templates
          or record consent first.
        </div>
      )}

      {selected && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
          {selected.header_text && (
            <p className="mb-1 font-semibold text-slate-900">
              {selected.header_text}
            </p>
          )}
          <p className="whitespace-pre-wrap">
            {previewTemplateBody(selected.body_text, {
              customerName: context.customerName,
              orderNumber: context.orderNumber,
            })}
          </p>
          {selected.footer_text && (
            <p className="mt-2 text-xs text-slate-500">{selected.footer_text}</p>
          )}
        </div>
      )}
    </div>
  );
}

const TEMPLATES_CACHE_TTL_MS = 30_000;
let approvedTemplatesCache: WhatsAppMessageTemplate[] | null = null;
let approvedTemplatesFetchedAt: number | null = null;
let approvedTemplatesPromise: Promise<WhatsAppMessageTemplate[]> | null = null;
let approvedTemplatesError: string | null = null;

async function fetchApprovedInboxTemplatesOnce(): Promise<
  WhatsAppMessageTemplate[]
> {
  const now = Date.now();
  if (
    approvedTemplatesCache &&
    approvedTemplatesFetchedAt != null &&
    now - approvedTemplatesFetchedAt < TEMPLATES_CACHE_TTL_MS
  ) {
    return approvedTemplatesCache;
  }

  if (approvedTemplatesPromise) return approvedTemplatesPromise;

  approvedTemplatesPromise = fetch("/api/inbox/templates")
    .then(async (res) => {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        templates?: WhatsAppMessageTemplate[];
      };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Failed to load templates");
      }
      return (data.templates ?? []) as WhatsAppMessageTemplate[];
    })
    .then((list) => {
      approvedTemplatesCache = list;
      approvedTemplatesFetchedAt = Date.now();
      approvedTemplatesError = null;
      return list;
    })
    .catch((err) => {
      approvedTemplatesError =
        err instanceof Error ? err.message : "Failed to load templates";
      approvedTemplatesPromise = null; // allow retry on next hook mount
      throw err;
    });

  return approvedTemplatesPromise;
}

export function useApprovedTemplates() {
  const [templates, setTemplates] = useState<WhatsAppMessageTemplate[]>(
    approvedTemplatesCache ?? []
  );
  const [loading, setLoading] = useState<boolean>(
    approvedTemplatesCache == null
  );
  const [error, setError] = useState<string | null>(approvedTemplatesError);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError(null);
        const list = await fetchApprovedInboxTemplatesOnce();
        if (cancelled) return;
        setTemplates(list);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load templates");
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { templates, loading, error };
}
