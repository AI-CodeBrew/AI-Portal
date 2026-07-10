"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  WaTemplateCategory,
  WaTemplateStatus,
  WhatsAppMessageTemplate,
} from "@/lib/whatsapp/message-templates";

const CATEGORIES: Array<{ id: WaTemplateCategory; label: string }> = [
  { id: "UTILITY", label: "Utility (transactional)" },
  { id: "MARKETING", label: "Marketing" },
  { id: "AUTHENTICATION", label: "Authentication" },
];

const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "en_US", label: "English (US)" },
  { id: "ar", label: "Arabic" },
];

type Stats = {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
};

function StatusBadge({ status }: { status: WaTemplateStatus }) {
  const styles: Record<WaTemplateStatus, string> = {
    draft: "bg-slate-100 text-slate-700",
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
    paused: "bg-slate-100 text-slate-600",
    disabled: "bg-slate-100 text-slate-600",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${styles[status]}`}
    >
      {(status === "pending" || status === "draft") && (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      {status === "approved" && (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
      {status === "rejected" && (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {status}
    </span>
  );
}

function emptyForm() {
  return {
    name: "",
    category: "UTILITY" as WaTemplateCategory,
    language: "en",
    headerText: "",
    bodyText: "",
    footerText: "",
  };
}

export function WhatsAppTemplatesPanel() {
  const [templates, setTemplates] = useState<WhatsAppMessageTemplate[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WhatsAppMessageTemplate | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const load = useCallback(async (withSync = false) => {
    if (withSync) setSyncing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/store/whatsapp-templates${withSync ? "?sync=1" : ""}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load templates");
      setTemplates(data.templates ?? []);
      setStats(data.stats ?? { total: 0, approved: 0, pending: 0, rejected: 0 });
      if (data.syncError) {
        setError(`Synced locally. Meta sync: ${data.syncError}`);
      } else if (withSync) {
        setSuccess(
          data.synced
            ? `Synced ${data.synced} template(s) from Meta.`
            : "Synced with Meta."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
    setError(null);
  }

  function openEdit(t: WhatsAppMessageTemplate) {
    if (t.status === "approved" || t.status === "pending") return;
    setEditing(t);
    setForm({
      name: t.name,
      category: t.category,
      language: t.language,
      headerText: t.header_text ?? "",
      bodyText: t.body_text,
      footerText: t.footer_text ?? "",
    });
    setModalOpen(true);
    setError(null);
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const url = editing
        ? `/api/store/whatsapp-templates/${editing.id}`
        : "/api/store/whatsapp-templates";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          name: form.name,
          category: form.category,
          language: form.language,
          headerText: form.headerText || null,
          bodyText: form.bodyText,
          footerText: form.footerText || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setModalOpen(false);
      setSuccess(editing ? "Template updated." : "Template created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function submitToMeta(t: WhatsAppMessageTemplate) {
    setSubmittingId(t.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/store/whatsapp-templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setSuccess(
        `Submitted "${t.name}" to Meta. Status: ${data.template?.status ?? "pending"}`
      );
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmittingId(null);
    }
  }

  async function removeTemplate(t: WhatsAppMessageTemplate) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/store/whatsapp-templates/${t.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setSuccess("Template deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Loading WhatsApp templates...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-amber-950">
          <span className="font-semibold">How it works:</span> Create a template
          below → click <em>Submit to Meta</em> → Meta reviews it (usually
          &lt;24h) → once <strong>Approved</strong> you can use it in follow-up
          messages.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={syncing}
            className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-60"
          >
            {syncing ? "Syncing..." : "Refresh from Meta"}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            + New template
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-600">
        {stats.total} templates · {stats.approved} approved · {stats.pending}{" "}
        awaiting review
        {stats.rejected > 0 ? ` · ${stats.rejected} rejected` : ""}
      </p>

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

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">No templates yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Create your first WhatsApp message template to submit to Meta.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            + New template
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-mono text-base font-bold text-slate-900">
                      {t.name}
                    </h3>
                    <StatusBadge status={t.status} />
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                      {t.category}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                      {t.language}
                    </span>
                  </div>
                  {t.rejection_reason &&
                    t.rejection_reason.toUpperCase() !== "NONE" && (
                    <p className="mt-1 text-xs text-red-600">
                      Rejected: {t.rejection_reason}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(t.status === "draft" || t.status === "rejected") && (
                    <button
                      type="button"
                      onClick={() => submitToMeta(t)}
                      disabled={submittingId === t.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      {submittingId === t.id ? "Submitting..." : "Submit to Meta"}
                    </button>
                  )}
                  {(t.status === "draft" || t.status === "rejected") && (
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeTemplate(t)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-800">
                {t.header_text && (
                  <div className="mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Header
                    </p>
                    <p className="font-semibold text-slate-900">{t.header_text}</p>
                  </div>
                )}
                <div className="whitespace-pre-wrap leading-relaxed">
                  {t.body_text}
                </div>
                {t.footer_text && (
                  <p className="mt-3 text-xs text-slate-500">{t.footer_text}</p>
                )}
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Created{" "}
                {new Date(t.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
                {t.last_synced_at
                  ? ` · Synced ${new Date(t.last_synced_at).toLocaleString()}`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editing ? "Edit template" : "New template"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={saveTemplate} className="space-y-4 px-5 py-5">
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Use <code className="rounded bg-white px-1">{"{{1}}"}</code> for
                the first variable,{" "}
                <code className="rounded bg-white px-1">{"{{2}}"}</code> for the
                second, etc. Example:{" "}
                <em>Hi {"{{1}}"}, your order {"{{2}}"} has been dispatched.</em>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              )}

              <label className="block text-sm">
                <span className="font-medium text-slate-700">
                  Template name (lowercase, underscores only)
                </span>
                <input
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                    }))
                  }
                  placeholder="order_dispatched"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  This becomes the Meta template name. Use snake_case.
                </span>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Category</span>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        category: e.target.value as WaTemplateCategory,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Language</span>
                  <select
                    value={form.language}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, language: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="font-medium text-slate-700">
                  Header text (optional)
                </span>
                <input
                  value={form.headerText}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, headerText: e.target.value }))
                  }
                  placeholder="Your order update"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>

              <label className="block text-sm">
                <span className="font-medium text-slate-700">
                  Body <span className="text-red-500">*</span>
                </span>
                <textarea
                  required
                  rows={5}
                  value={form.bodyText}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bodyText: e.target.value }))
                  }
                  placeholder="Hi {{1}}, your order {{2}} has been dispatched and will arrive in 2-3 days."
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>

              <label className="block text-sm">
                <span className="font-medium text-slate-700">
                  Footer text (optional)
                </span>
                <input
                  value={form.footerText}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, footerText: e.target.value }))
                  }
                  placeholder="Reply STOP to unsubscribe"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : editing
                      ? "Save changes"
                      : "Create template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
