"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BroadcastContact,
  BroadcastListItem,
  BroadcastRecipient,
} from "@/lib/broadcasts";

type ApprovedTemplate = {
  id: string;
  name: string;
  language: string;
  body_text: string;
  category: string;
};

type View = "list" | "create" | "detail";

export function BroadcastsPanel() {
  const [view, setView] = useState<View>("list");
  const [broadcasts, setBroadcasts] = useState<BroadcastListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<BroadcastContact[]>([]);
  const [templates, setTemplates] = useState<ApprovedTemplate[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [contactSearch, setContactSearch] = useState("");
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [broadcastName, setBroadcastName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [sending, setSending] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BroadcastListItem | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadBroadcasts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/store/broadcasts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load broadcasts");
      setBroadcasts(data.broadcasts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBroadcasts();
  }, [loadBroadcasts]);

  async function openCreate() {
    setError(null);
    setView("create");
    setSelectedPhones(new Set());
    setCsvText("");
    setCsvFileName(null);
    setBroadcastName("");
    setTemplateId("");
    setContactSearch("");

    const [contactsRes, templatesRes] = await Promise.all([
      fetch("/api/inbox/contacts"),
      fetch("/api/store/whatsapp-templates?sync=1"),
    ]);
    const contactsData = await contactsRes.json();
    const templatesData = await templatesRes.json();
    setContacts(contactsData.contacts ?? []);
    const list = (templatesData.templates ?? []) as Array<
      ApprovedTemplate & { status?: string }
    >;
    setTemplates(list.filter((t) => t.status === "approved"));
  }

  async function openDetail(id: string) {
    setDetailId(id);
    setView("detail");
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/store/broadcasts/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load broadcast");
      setDetail(data.broadcast);
      setRecipients(data.recipients ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setDetailLoading(false);
    }
  }

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const digits = contactSearch.replace(/\D/g, "");
    if (!q) return contacts;
    return contacts.filter((c) => {
      const name = (c.name ?? "").toLowerCase();
      return name.includes(q) || c.phone.includes(digits) || c.phone.includes(q);
    });
  }, [contacts, contactSearch]);

  function togglePhone(phone: string) {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      for (const c of filteredContacts) next.add(c.phone);
      return next;
    });
  }

  function clearSelection() {
    setSelectedPhones(new Set());
  }

  async function onCsvFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setCsvFileName(file.name);
  }

  async function sendBroadcast() {
    if (!templateId) {
      setError("Select a Meta-approved template");
      return;
    }
    const selected = contacts.filter((c) => selectedPhones.has(c.phone));
    if (selected.length === 0 && !csvText.trim()) {
      setError("Select contacts or upload a CSV");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/store/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: broadcastName.trim() || undefined,
          templateId,
          recipients: selected,
          csvText: csvText.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Broadcast failed");
      await loadBroadcasts();
      if (data.broadcast?.id) {
        await openDetail(data.broadcast.id);
      } else {
        setView("list");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Broadcast failed");
    } finally {
      setSending(false);
    }
  }

  function statusBadge(status: string) {
    const styles: Record<string, string> = {
      completed: "bg-emerald-100 text-emerald-800",
      sending: "bg-blue-100 text-blue-800",
      failed: "bg-red-100 text-red-800",
      draft: "bg-slate-100 text-slate-700",
      sent: "bg-emerald-100 text-emerald-800",
      pending: "bg-amber-100 text-amber-900",
    };
    return (
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          styles[status] ?? "bg-slate-100 text-slate-700"
        }`}
      >
        {status}
      </span>
    );
  }

  if (view === "create") {
    const selectedTemplate = templates.find((t) => t.id === templateId);
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              New broadcast
            </h2>
            <p className="text-sm text-slate-600">
              Pick contacts, choose a Meta-approved template, then send.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView("list")}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Broadcast name
            </label>
            <input
              value={broadcastName}
              onChange={(e) => setBroadcastName(e.target.value)}
              placeholder="Ramadan promo"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Template (Meta approved) *
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.language}) · {t.category}
                </option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="mt-1 text-xs text-amber-800">
                No approved templates. Create and get approval under WA
                Templates first.
              </p>
            )}
            {selectedTemplate && (
              <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                {selectedTemplate.body_text}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Contacts from inbox / customers
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-xs font-semibold text-blue-700 hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs font-semibold text-slate-600 hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
          <input
            type="search"
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
            placeholder="Filter contacts by name or phone..."
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
            {filteredContacts.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                No contacts yet. Inbox chats and customers will appear here.
              </p>
            ) : (
              filteredContacts.map((c) => (
                <label
                  key={c.phone}
                  className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedPhones.has(c.phone)}
                    onChange={() => togglePhone(c.phone)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {c.name?.trim() || `+${c.phone}`}
                    </span>
                    {c.name?.trim() ? (
                      <span className="block text-xs text-slate-500">
                        +{c.phone}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">
                    {c.source}
                  </span>
                </label>
              ))
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {selectedPhones.size} selected from list
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Or upload CSV contacts
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            Columns: <code className="font-mono">name,phone</code> — phone in
            international digits (e.g. 9715…).
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void onCsvFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <a
              href="/api/store/broadcasts?sample=1"
              className="text-sm font-semibold text-blue-700 hover:underline"
            >
              Download sample CSV
            </a>
          </div>
          {csvFileName && (
            <p className="mt-2 text-xs text-emerald-700">
              Loaded {csvFileName}
              <button
                type="button"
                className="ml-2 font-semibold text-slate-600 hover:underline"
                onClick={() => {
                  setCsvText("");
                  setCsvFileName(null);
                }}
              >
                Remove
              </button>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void sendBroadcast()}
          disabled={sending || !templateId}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {sending ? "Sending broadcast..." : "Send broadcast"}
        </button>
      </div>
    );
  }

  if (view === "detail") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setView("list");
              setDetailId(null);
            }}
            className="text-sm font-semibold text-blue-700 hover:underline"
          >
            ← All broadcasts
          </button>
          {detailId && (
            <button
              type="button"
              onClick={() => void openDetail(detailId)}
              className="text-sm font-medium text-slate-600 hover:underline"
            >
              Refresh
            </button>
          )}
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        {detailLoading || !detail ? (
          <p className="text-slate-600">Loading...</p>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {detail.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Template:{" "}
                    <span className="font-mono text-slate-800">
                      {detail.template_name}
                    </span>{" "}
                    ({detail.template_language})
                  </p>
                </div>
                {statusBadge(detail.status)}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-lg font-bold text-slate-900">
                    {detail.total_recipients}
                  </p>
                  <p className="text-xs text-slate-500">Recipients</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3">
                  <p className="text-lg font-bold text-emerald-800">
                    {detail.sent_count}
                  </p>
                  <p className="text-xs text-slate-500">Sent</p>
                </div>
                <div className="rounded-lg bg-red-50 p-3">
                  <p className="text-lg font-bold text-red-800">
                    {detail.failed_count}
                  </p>
                  <p className="text-xs text-slate-500">Failed</p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      Contact
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      Error
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recipients.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2">
                        <p className="font-medium text-slate-900">
                          {r.name?.trim() || `+${r.phone}`}
                        </p>
                        {r.name?.trim() ? (
                          <p className="text-xs text-slate-500">+{r.phone}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2">{statusBadge(r.status)}</td>
                      <td className="max-w-xs truncate px-4 py-2 text-xs text-red-700">
                        {r.error ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Send Meta-approved template messages to many contacts at once.
        </p>
        <button
          type="button"
          onClick={() => void openCreate()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Create broadcast
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-slate-600">Loading broadcasts...</p>
      ) : broadcasts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <p className="font-medium text-slate-800">No broadcasts yet</p>
          <p className="mt-2 text-sm text-slate-600">
            Create a broadcast to message inbox customers or a CSV list with an
            approved WhatsApp template.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">
                  Template
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">
                  Results
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {broadcasts.map((b) => (
                <tr
                  key={b.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => void openDetail(b.id)}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {b.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    {b.template_name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {b.sent_count}/{b.total_recipients} sent
                    {b.failed_count > 0 ? ` · ${b.failed_count} failed` : ""}
                  </td>
                  <td className="px-4 py-3">{statusBadge(b.status)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(b.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
