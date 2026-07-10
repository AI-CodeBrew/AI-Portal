"use client";

import { useEffect, useState } from "react";
import type { Order } from "@/lib/types";
import type { WhatsAppMessageTemplate } from "@/lib/whatsapp/message-templates";

export function OrderFollowUpModal({
  order,
  onClose,
  onSent,
}: {
  order: Order;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [templates, setTemplates] = useState<WhatsAppMessageTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/orders/${order.id}/follow-up`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const list = (data.templates ?? []) as WhatsAppMessageTemplate[];
        setTemplates(list);
        if (list.length > 0) setTemplateId(list[0].id);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load templates")
      )
      .finally(() => setLoading(false));
  }, [order.id]);

  async function send() {
    if (!templateId) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      onSent(
        `Follow-up "${data.templateName}" sent to +${data.to} via WhatsApp.`
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const selected = templates.find((t) => t.id === templateId);
  const phone = order.customers?.phone;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Send follow-up</h2>
            <p className="text-xs text-slate-500">
              Order {order.order_number ?? order.id.slice(0, 8)}
              {phone ? ` · +${phone}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {!phone && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This order has no customer phone. Follow-up cannot be sent.
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-slate-600">Loading approved templates...</p>
          ) : templates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
              No Meta-approved WhatsApp templates yet. Create one under{" "}
              <strong>WA Templates</strong> and wait for Meta approval.
            </div>
          ) : (
            <>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">
                  Approved template
                </span>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.language} · {t.category}
                    </option>
                  ))}
                </select>
              </label>

              {selected && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                  {selected.header_text && (
                    <p className="mb-1 font-semibold text-slate-900">
                      {selected.header_text}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{selected.body_text}</p>
                  {selected.footer_text && (
                    <p className="mt-2 text-xs text-slate-500">
                      {selected.footer_text}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              sending || !templateId || !phone || templates.length === 0
            }
            onClick={send}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send on WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}
