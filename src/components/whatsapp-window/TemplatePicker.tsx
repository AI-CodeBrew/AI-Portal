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

export function useApprovedTemplates() {
  const [templates, setTemplates] = useState<WhatsAppMessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/inbox/templates")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        const list = (data.templates ?? []) as WhatsAppMessageTemplate[];
        setTemplates(list);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load templates");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { templates, loading, error };
}
