"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConversationOutcomeRow } from "@/lib/outcomes/types";
import { MAX_ACTIVE_PROMPT_EXAMPLES } from "@/lib/outcomes/types";

type PromptExampleSummary = {
  id: string;
  outcome_id: string | null;
  objection_type: string | null;
  promoted_at: string;
  active: boolean;
};

const OBJECTION_FILTERS = [
  { value: "all", label: "All objections" },
  { value: "price", label: "Price" },
  { value: "authenticity", label: "Authenticity" },
  { value: "delivery_time", label: "Delivery time" },
  { value: "none", label: "None" },
  { value: "other", label: "Other" },
] as const;

function toneBadge(tone: string | null) {
  if (!tone) return "—";
  return tone.replace(/-/g, " ");
}

export function OutcomesPanel() {
  const [outcomes, setOutcomes] = useState<ConversationOutcomeRow[]>([]);
  const [topByObjection, setTopByObjection] = useState<
    Record<string, ConversationOutcomeRow[]>
  >({});
  const [promptExamples, setPromptExamples] = useState<PromptExampleSummary[]>(
    []
  );
  const [objectionFilter, setObjectionFilter] =
    useState<(typeof OBJECTION_FILTERS)[number]["value"]>("all");
  const [sort, setSort] = useState<"messages_asc" | "messages_desc">(
    "messages_asc"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const promotedOutcomeIds = useMemo(
    () =>
      new Set(
        promptExamples
          .filter((e) => e.active && e.outcome_id)
          .map((e) => e.outcome_id as string)
      ),
    [promptExamples]
  );

  const activeExampleCount = useMemo(
    () => promptExamples.filter((e) => e.active).length,
    [promptExamples]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        objection_type: objectionFilter,
        sort,
      });
      const res = await fetch(`/api/outcomes?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load outcomes");
      setOutcomes(data.outcomes ?? []);
      setTopByObjection(data.topByObjection ?? {});
      setPromptExamples(data.promptExamples ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [objectionFilter, sort]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePromote(outcomeId: string) {
    setPromotingId(outcomeId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/outcomes/${outcomeId}/promote`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Promote failed");
      setSuccess(data.message ?? "Promoted to agent examples.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promote failed");
    } finally {
      setPromotingId(null);
    }
  }

  async function handleToggleExample(exampleId: string, active: boolean) {
    setTogglingId(exampleId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/prompt-examples/${exampleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setSuccess(active ? "Example activated." : "Example deactivated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setTogglingId(null);
    }
  }

  const topIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rows of Object.values(topByObjection)) {
      for (const row of rows.slice(0, 5)) {
        ids.add(row.id);
      }
    }
    return ids;
  }, [topByObjection]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Objection
            </label>
            <select
              value={objectionFilter}
              onChange={(e) =>
                setObjectionFilter(
                  e.target.value as (typeof OBJECTION_FILTERS)[number]["value"]
                )
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {OBJECTION_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sort by messages to close
            </label>
            <select
              value={sort}
              onChange={(e) =>
                setSort(e.target.value as "messages_asc" | "messages_desc")
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="messages_asc">Fewest first (fastest closes)</option>
              <option value="messages_desc">Most first</option>
            </select>
          </div>
          <p className="text-sm text-slate-600">
            Active agent examples:{" "}
            <span className="font-semibold text-slate-900">
              {activeExampleCount}/{MAX_ACTIVE_PROMPT_EXAMPLES}
            </span>
          </p>
        </div>
      </div>

      {Object.keys(topByObjection).length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h3 className="text-sm font-semibold text-amber-900">
            Top fast closes by objection
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Object.entries(topByObjection).map(([objection, rows]) => (
              <div
                key={objection}
                className="rounded-lg border border-amber-100 bg-white p-3 text-sm"
              >
                <p className="font-medium capitalize text-slate-900">
                  {objection.replace(/_/g, " ")}
                </p>
                <ul className="mt-2 space-y-1 text-slate-600">
                  {rows.slice(0, 5).map((row) => (
                    <li key={row.id}>
                      {row.messages_to_close ?? "?"} msgs —{" "}
                      {row.customer_tone ? toneBadge(row.customer_tone) : "—"}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-900">Closed deal outcomes</h3>
          <p className="text-sm text-slate-600">
            Learnings from confirmed WhatsApp orders. Promote the best ones into
            the live agent prompt.
          </p>
        </div>

        {loading ? (
          <p className="px-4 py-8 text-sm text-slate-600">Loading…</p>
        ) : outcomes.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-600">
            No extracted outcomes yet. Confirmed WhatsApp orders are analyzed
            hourly once migration 033 is applied.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Objection</th>
                  <th className="px-4 py-3">Msgs to close</th>
                  <th className="px-4 py-3">Tone</th>
                  <th className="px-4 py-3">What worked</th>
                  <th className="px-4 py-3">Closing line</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {outcomes.map((row) => {
                  const isTop = topIds.has(row.id);
                  const isPromoted = promotedOutcomeIds.has(row.id);
                  return (
                    <tr
                      key={row.id}
                      className={isTop ? "bg-emerald-50/40" : undefined}
                    >
                      <td className="px-4 py-3 capitalize">
                        {row.objection_type?.replace(/_/g, " ") ?? "—"}
                        {isTop && (
                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            Top close
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {row.messages_to_close ?? "—"}
                      </td>
                      <td className="px-4 py-3 capitalize">
                        {toneBadge(row.customer_tone)}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-slate-700">
                        {row.what_worked ?? "—"}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-slate-600">
                        {row.key_closing_line ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {isPromoted ? (
                          <span className="text-xs font-medium text-emerald-700">
                            In live examples
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handlePromote(row.id)}
                            disabled={promotingId === row.id}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {promotingId === row.id
                              ? "Promoting…"
                              : "Promote to examples"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {promptExamples.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="font-semibold text-slate-900">Live prompt examples</h3>
            <p className="text-sm text-slate-600">
              Up to {MAX_ACTIVE_PROMPT_EXAMPLES} active snippets are injected
              into the sales agent system prompt.
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {promptExamples.map((ex) => (
              <li
                key={ex.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      ex.active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {ex.active ? "Active" : "Inactive"}
                  </span>
                  <span className="ml-2 capitalize text-slate-700">
                    {ex.objection_type?.replace(/_/g, " ") ?? "none"}
                  </span>
                  <span className="ml-2 text-slate-500">
                    {new Date(ex.promoted_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleExample(ex.id, !ex.active)}
                  disabled={togglingId === ex.id}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {togglingId === ex.id
                    ? "Saving…"
                    : ex.active
                      ? "Deactivate"
                      : "Activate"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
