"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AdminPaginationBar,
  ADMIN_PAGE_SIZE_OPTIONS,
  type AdminPageSize,
} from "@/components/AdminPaginationBar";
import {
  GLOBAL_STORE_FILTER,
  REBUTTAL_STATUSES,
  type AdminRebuttalCounts,
  type AdminRebuttalRow,
  type RebuttalStatus,
} from "@/lib/admin/rebuttals";
import type { AdminResellerRow } from "@/lib/admin/resellers";

type Props = { resellers: AdminResellerRow[] };

const EMPTY_COUNTS: AdminRebuttalCounts = {
  pending: 0,
  approved: 0,
  rejected: 0,
};

function statusClass(status: RebuttalStatus): string {
  if (status === "approved") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-900";
}

function resellerOptionLabel(r: AdminResellerRow): string {
  return (
    r.store?.store_name ?? r.store?.shop_domain ?? r.email ?? "Reseller"
  );
}

function scopeLabel(row: AdminRebuttalRow): string {
  if (!row.store_id) return "Global";
  return row.stores?.store_name ?? row.stores?.shop_domain ?? "Store";
}

function truncate(text: string, max = 120): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function AdminRebuttalsPanel({ resellers }: Props) {
  const resellersWithStore = resellers.filter((r) => r.store_id);

  const [rows, setRows] = useState<AdminRebuttalRow[]>([]);
  const [counts, setCounts] = useState<AdminRebuttalCounts>(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState<RebuttalStatus>("pending");
  const [storeFilter, setStoreFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<AdminPageSize>(
    ADMIN_PAGE_SIZE_OPTIONS[0]
  );

  const [editing, setEditing] = useState<AdminRebuttalRow | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      status,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (storeFilter !== "all") params.set("storeId", storeFilter);

    try {
      const res = await fetch(`/api/admin/rebuttals?${params}`);
      const data = await res.json();
      if (res.ok) {
        setRows(data.rebuttals ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 0);
        setCounts(data.counts ?? EMPTY_COUNTS);
      } else {
        setError(data.error ?? "Could not load rebuttals");
      }
    } catch {
      setError("Could not load rebuttals");
    } finally {
      setLoading(false);
    }
  }, [status, storeFilter, page, pageSize, setError]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  function goToPage(next: number) {
    setPage(Math.min(Math.max(1, next), Math.max(1, totalPages)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-4 sm:py-4">
          <div className="flex flex-wrap gap-2">
            {REBUTTAL_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize transition ${
                  status === s
                    ? "bg-violet-600 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {s}
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${
                    status === s
                      ? "bg-violet-500 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {counts[s]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex w-full flex-col gap-1 sm:w-auto sm:min-w-[280px]">
            <label
              htmlFor="rebuttal-store-filter"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Scope
            </label>
            <select
              id="rebuttal-store-filter"
              value={storeFilter}
              onChange={(e) => {
                setStoreFilter(e.target.value);
                setPage(1);
              }}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
            >
              <option value="all">All stores</option>
              <option value={GLOBAL_STORE_FILTER}>Global only</option>
              {resellersWithStore.map((r) => (
                <option key={r.id} value={r.store_id!}>
                  {resellerOptionLabel(r)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                  Objection
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                  Answer
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                  Scope
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                  Served
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-slate-600"
                  >
                    Loading rebuttals...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-slate-600"
                  >
                    No {status} rebuttals
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setEditing(row)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="max-w-xs px-4 py-3 text-sm font-medium text-slate-900">
                      {truncate(row.objection_text)}
                    </td>
                    <td className="max-w-md px-4 py-3 text-sm text-slate-700">
                      {truncate(row.answer_text)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.store_id
                            ? "bg-slate-100 text-slate-700"
                            : "bg-violet-100 text-violet-800"
                        }`}
                      >
                        {scopeLabel(row)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {row.times_served}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {new Date(row.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 p-3 md:hidden">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-600">
              Loading rebuttals...
            </p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-600">
              No {status} rebuttals
            </p>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setEditing(row)}
                className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {truncate(row.objection_text, 90)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {truncate(row.answer_text, 110)}
                </p>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${
                      row.store_id
                        ? "bg-slate-100 text-slate-700"
                        : "bg-violet-100 text-violet-800"
                    }`}
                  >
                    {scopeLabel(row)}
                  </span>
                  <span>Served {row.times_served}×</span>
                </div>
              </button>
            ))
          )}
        </div>

        <AdminPaginationBar
          page={page}
          totalPages={Math.max(1, totalPages)}
          pageSize={pageSize}
          totalItems={total}
          itemLabel="rebuttals"
          loading={loading}
          onPageChange={goToPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      {editing && (
        <RebuttalReviewModal
          row={editing}
          resellers={resellersWithStore}
          saving={savingId === editing.id}
          onClose={() => setEditing(null)}
          onAction={async (action, patch) => {
            setSavingId(editing.id);
            setMessage(null);
            setError(null);
            try {
              const res = await fetch(`/api/admin/rebuttals/${editing.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, ...patch }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                throw new Error(data.error ?? "Update failed");
              }
              setEditing(null);
              setMessage(
                action === "approve"
                  ? "Rebuttal approved — the agent can use it now."
                  : action === "reject"
                    ? "Rebuttal rejected."
                    : "Changes saved."
              );
              await fetchRows();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Update failed");
            } finally {
              setSavingId(null);
            }
          }}
        />
      )}
    </div>
  );
}

type ModalPatch = {
  answerText?: string;
  objectionText?: string;
  storeId?: string | null;
};

function RebuttalReviewModal({
  row,
  resellers,
  saving,
  onClose,
  onAction,
}: {
  row: AdminRebuttalRow;
  resellers: AdminResellerRow[];
  saving: boolean;
  onClose: () => void;
  onAction: (
    action: "approve" | "reject" | "save",
    patch: ModalPatch
  ) => Promise<void>;
}) {
  const [answer, setAnswer] = useState(row.answer_text);
  const [objection, setObjection] = useState(row.objection_text);
  const [editObjection, setEditObjection] = useState(false);
  const [scope, setScope] = useState(row.store_id ?? GLOBAL_STORE_FILTER);

  function patch(): ModalPatch {
    return {
      answerText: answer,
      objectionText: editObjection ? objection : undefined,
      storeId: scope === GLOBAL_STORE_FILTER ? null : scope,
    };
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Review rebuttal
            </h2>
            <p className="text-sm text-slate-600">
              Approving lets the agent use this answer for matching objections.
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusClass(row.status)}`}
          >
            {row.status}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Customer objection
              </label>
              <button
                type="button"
                onClick={() => setEditObjection((v) => !v)}
                className="text-xs font-semibold text-violet-700 hover:underline"
              >
                {editObjection ? "Cancel edit" : "Edit objection"}
              </button>
            </div>
            {editObjection ? (
              <>
                <textarea
                  value={objection}
                  onChange={(e) => setObjection(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
                />
                <p className="mt-1 text-xs text-amber-700">
                  Editing the objection re-generates its embedding.
                </p>
              </>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {row.objection_text}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="rebuttal-answer"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Approved answer
            </label>
            <textarea
              id="rebuttal-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
            <p className="mt-1 text-xs text-slate-500">
              The agent keeps the substance and re-words it in the customer&apos;s
              language. Do not promise discounts beyond the store&apos;s ladder.
            </p>
          </div>

          <div>
            <label
              htmlFor="rebuttal-scope"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Applies to
            </label>
            <select
              id="rebuttal-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
            >
              <option value={GLOBAL_STORE_FILTER}>All stores (global)</option>
              {resellers.map((r) => (
                <option key={r.id} value={r.store_id!}>
                  {resellerOptionLabel(r)}
                </option>
              ))}
            </select>
          </div>

          {row.source_conversation_id && (
            <Link
              href={`/admin/chats?conversationId=${row.source_conversation_id}`}
              className="inline-block text-sm font-semibold text-violet-700 hover:underline"
            >
              View source conversation →
            </Link>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving || !answer.trim()}
            onClick={() => onAction("approve", patch())}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Approve"}
          </button>
          <button
            type="button"
            disabled={saving || !answer.trim()}
            onClick={() => onAction("save", patch())}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Save edit
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onAction("reject", {})}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
