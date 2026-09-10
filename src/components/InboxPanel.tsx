"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cachedJsonFetch, invalidateCachedJson } from "@/lib/client-fetch-cache";
import { ChatMessageBody } from "@/components/ChatMessageBody";
import { createClient } from "@/lib/supabase/client";
import type { WhatsappConversation, WhatsappMessage } from "@/lib/types";
import { ConversationComposer } from "@/components/whatsapp-window/ConversationComposer";
import { ConversationListRow } from "@/components/whatsapp-window/ConversationListRow";
import { WindowCountdownBadge } from "@/components/whatsapp-window/WindowCountdownBadge";
import { useWindowCountdown } from "@/components/whatsapp-window/useWindowCountdown";

type InboxFilter = "all" | "ai" | "handoff" | "exhausted" | "closing_soon";

const INBOX_PAGE_SIZE = 10;
const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ai", label: "AI" },
  { key: "handoff", label: "Human" },
  { key: "exhausted", label: "Exhausted" },
  { key: "closing_soon", label: "Closing soon" },
];

function displayName(conv: WhatsappConversation): string {
  const name = conv.customer_name?.trim();
  if (name) return name;
  return `+${conv.customer_phone}`;
}

function MessageStatusBadge({
  status,
  errorMessage,
}: {
  status?: "sent" | "delivered" | "read" | "failed" | null;
  errorMessage?: string | null;
}) {
  if (!status) return null;

  if (status === "failed") {
    return (
      <div
        className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-200"
        title={errorMessage || "WhatsApp could not deliver this message"}
      >
        <span>⚠ Not delivered</span>
      </div>
    );
  }

  const label =
    status === "read" ? "Read" : status === "delivered" ? "Delivered" : "Sent";
  const marks = status === "sent" ? "✓" : "✓✓";

  return (
    <div
      className={`mt-1 text-right text-[11px] ${
        status === "read" ? "text-sky-200" : "text-blue-200"
      }`}
      title={label}
    >
      {marks}
    </div>
  );
}

function ChatWindowHeader({
  selected,
  isManual,
  switchingMode,
  deleting,
  onSwitchMode,
  onDelete,
}: {
  selected: WhatsappConversation;
  isManual: boolean;
  switchingMode: boolean;
  deleting: boolean;
  onSwitchMode: (mode: "ai" | "manual") => void;
  onDelete: () => void;
}) {
  const windowStatus = useWindowCountdown(
    selected.last_customer_message_at,
    selected.window_type ?? "service"
  );

  return (
    <div className="border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-900">
              {displayName(selected)}
            </p>
            <WindowCountdownBadge status={windowStatus} size="lg" />
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                isManual
                  ? "bg-amber-100 text-amber-900"
                  : "bg-emerald-100 text-emerald-900"
              }`}
            >
              {isManual ? "Human" : "AI"}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {selected.customer_name?.trim()
              ? `+${selected.customer_phone} · `
              : ""}
            {isManual ? "You are replying" : "AI is handling replies"}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isManual ? (
            <button
              type="button"
              onClick={() => onSwitchMode("ai")}
              disabled={switchingMode || deleting}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {switchingMode ? "Switching..." : "Back to AI"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSwitchMode("manual")}
              disabled={switchingMode || deleting}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {switchingMode ? "Switching..." : "Take over"}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting || switchingMode}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InboxPanel() {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [conversations, setConversations] = useState<WhatsappConversation[]>(
    []
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(INBOX_PAGE_SIZE);
  const [pageSizeInput, setPageSizeInput] = useState(String(INBOX_PAGE_SIZE));
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const fetchConversations = useCallback(
    async (opts?: { page?: number; limit?: number; silent?: boolean; force?: boolean }) => {
      const p = opts?.page ?? page;
      const limit = opts?.limit ?? pageSize;
      const params = new URLSearchParams({
        filter,
        page: String(p),
        limit: String(limit),
      });
      if (debouncedSearch) params.set("q", debouncedSearch);
      const cacheKey = `inbox:list:${params.toString()}`;
      if (!opts?.silent) setLoading(true);

      try {
        const { data } = await cachedJsonFetch<{
          conversations?: WhatsappConversation[];
          total?: number;
          totalPages?: number;
          page?: number;
          limit?: number;
        }>(cacheKey, `/api/inbox?${params}`, {
          ttlMs: 15_000,
          staleWhileRevalidate: !opts?.force,
          force: opts?.force ?? false,
        });

        const list = (data.conversations ?? []) as WhatsappConversation[];
        const nextTotal = data.total ?? list.length;
        const nextPages = Math.max(
          1,
          data.totalPages ?? (Math.ceil(nextTotal / limit) || 1)
        );

        setConversations(list);
        setTotal(nextTotal);
        setTotalPages(nextPages);
        setSelectedId((prev) => {
          if (list.length && !list.some((c) => c.id === prev)) {
            return list[0]!.id;
          }
          if (!list.length) return null;
          return prev;
        });
        if (!list.length) setMessages([]);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [filter, debouncedSearch, page, pageSize]
  );

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => conversations.some((c) => c.id === id))
    );
  }, [conversations]);

  useEffect(() => {
    void fetchConversations({ page, limit: pageSize });
  }, [page, pageSize, filter, debouncedSearch, fetchConversations]);

  const storeId = conversations[0]?.store_id;

  useEffect(() => {
    if (!storeId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`inbox-conversations-${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_conversations",
          filter: `store_id=eq.${storeId}`,
        },
        () => {
          invalidateCachedJson(`inbox:list:`);
          void fetchConversations({ silent: true });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storeId, fetchConversations]);

  useEffect(() => {
    if (selectedId) {
      setSendError(null);
      void fetchMessages(selectedId);
    }
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`inbox-messages-${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        () => {
          void fetchMessages(selectedId);
          void fetchConversations({ silent: true });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedId, fetchConversations]);

  async function fetchMessages(conversationId: string) {
    const res = await fetch(
      `/api/inbox/messages?conversationId=${conversationId}`
    );
    const data = await res.json();
    setMessages(data.messages ?? []);
  }

  async function refreshAfterSend() {
    if (!selectedId) return;
    await fetchMessages(selectedId);
    invalidateCachedJson(`inbox:list:`);
    await fetchConversations({ silent: true });
  }

  async function switchMode(mode: "ai" | "manual") {
    if (!selectedId) return;
    setSwitchingMode(true);
    try {
      const res = await fetch("/api/inbox/mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, mode }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update mode");
      }
      invalidateCachedJson(`inbox:list:`);
      await fetchConversations({ silent: true });
    } finally {
      setSwitchingMode(false);
    }
  }

  async function deleteConversation() {
    if (!selectedId) return;
    await deleteConversationsByIds([selectedId]);
  }

  function toggleConversationSelection(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function selectAllConversations() {
    setSelectedIds(conversations.map((c) => c.id));
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds([]);
  }

  async function deleteConversationsByIds(ids: string[]) {
    if (!ids.length) return;

    const count = ids.length;
    const label =
      count === 1
        ? (() => {
            const conv = conversations.find((c) => c.id === ids[0]);
            return conv ? displayName(conv) : "this chat";
          })()
        : `${count} chats`;

    if (
      !confirm(
        count === 1
          ? `Delete chat with ${label}? This removes the conversation from the portal (not from the customer's WhatsApp). Their next message starts a fresh AI conversation.`
          : `Delete ${label}? This removes them from the portal (not from customers' WhatsApp). Their next messages start fresh AI conversations.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setSendError(null);
    try {
      const res = await fetch("/api/inbox/conversations/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to delete chats"
        );
      }

      if (selectedId && ids.includes(selectedId)) {
        setSelectedId(null);
        setMessages([]);
      }

      setSelectedIds([]);
      setSelectionMode(false);
      invalidateCachedJson(`inbox:list:`);
      await fetchConversations({ force: true });
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Failed to delete chats"
      );
    } finally {
      setDeleting(false);
    }
  }

  async function deleteSelectedConversations() {
    await deleteConversationsByIds(selectedIds);
  }

  function applyRowsPerPage(raw: string | number) {
    const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n)) {
      setPageSizeInput(String(pageSize));
      return;
    }
    const next = Math.min(100, Math.max(1, Math.floor(n)));
    setPageSizeInput(String(next));
    setPage(1);
    setPageSize(next);
    invalidateCachedJson(`inbox:list:`);
  }

  function goToPage(next: number) {
    const target = Math.max(1, Math.min(totalPages, Math.floor(next)));
    if (target === page) return;
    setPage(target);
  }

  const selected = conversations.find((c) => c.id === selectedId);
  const isManual = selected?.status === "human_handoff";

  const emptyHint = useMemo(() => {
    if (debouncedSearch) {
      return "No conversations match your search.";
    }
    if (filter === "closing_soon") {
      return "No conversations are in the closing-soon window right now.";
    }
    return "Send a test message to your business number. If nothing appears, check Integrations → WhatsApp.";
  }, [debouncedSearch, filter]);

  const allConversationsSelected =
    conversations.length > 0 && selectedIds.length === conversations.length;

  const selectedWindowStatus = useWindowCountdown(
    selected?.last_customer_message_at,
    selected?.window_type ?? "service"
  );

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const effectiveTotalPages = Math.max(
    1,
    totalPages,
    total > 0 ? Math.ceil(total / pageSize) : 1
  );

  return (
    <div className="space-y-2">
      {sendError && !selected ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {sendError}
        </div>
      ) : null}

      <div className="flex h-[calc(100vh-10.5rem)] min-h-[520px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex w-full max-w-md shrink-0 flex-col border-r border-slate-200 bg-slate-50 sm:w-96">
          <div className="space-y-1.5 border-b border-slate-200 bg-white px-2.5 py-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone…"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              aria-label="Search conversations"
            />
            <div className="flex flex-wrap gap-1">
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setFilter(key);
                    setPage(1);
                  }}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    filter === key
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
            <p className="text-xs font-medium text-slate-600">
              {total > 0 ? (
                <>
                  <span className="font-semibold text-slate-900">
                    {rangeStart}–{rangeEnd}
                  </span>{" "}
                  of {total.toLocaleString()}
                </>
              ) : (
                "No chats"
              )}
            </p>
            {selectionMode ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (allConversationsSelected) setSelectedIds([]);
                    else selectAllConversations();
                  }}
                  className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {allConversationsSelected ? "Clear" : "Select page"}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSelectedConversations()}
                  disabled={deleting || selectedIds.length === 0}
                  className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Delete ({selectedIds.length})
                </button>
                <button
                  type="button"
                  onClick={exitSelectionMode}
                  className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Done
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSelectionMode(true)}
                disabled={deleting || conversations.length === 0}
                className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Select
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-xs text-slate-500">
                {conversations.length === 0 ? "Loading inbox…" : "Updating…"}
              </p>
            ) : null}
            {!loading && conversations.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">
                  {debouncedSearch || filter !== "all"
                    ? "No matches"
                    : "No WhatsApp conversations yet"}
                </p>
                <p className="mt-1.5 text-xs text-slate-500">{emptyHint}</p>
              </div>
            ) : null}
            {conversations.map((conv) => (
              <ConversationListRow
                key={conv.id}
                conv={conv}
                selected={selectedId === conv.id}
                onSelect={() => setSelectedId(conv.id)}
                onFollowUpSent={() => void refreshAfterSend()}
                selectionMode={selectionMode}
                checked={selectedIds.includes(conv.id)}
                onToggleSelect={() => toggleConversationSelection(conv.id)}
              />
            ))}
          </div>

          <div className="space-y-1.5 border-t border-slate-200 bg-white px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="font-medium">Rows</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  inputMode="numeric"
                  value={pageSizeInput}
                  onChange={(e) => setPageSizeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyRowsPerPage(pageSizeInput);
                    }
                  }}
                  className="w-14 rounded-md border border-slate-300 px-1.5 py-1 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
                  aria-label="Rows per page"
                />
              </label>
              <button
                type="button"
                onClick={() => applyRowsPerPage(pageSizeInput)}
                disabled={loading}
                className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Apply
              </button>
              <span className="ml-auto text-[11px] text-slate-500">
                Page {page} / {effectiveTotalPages}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1 || loading}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= effectiveTotalPages || loading}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-slate-50">
          {selected ? (
            <ChatWindowHeader
              selected={selected}
              isManual={isManual}
              switchingMode={switchingMode}
              deleting={deleting}
              onSwitchMode={switchMode}
              onDelete={deleteConversation}
            />
          ) : (
            <div className="border-b border-slate-200 bg-white px-4 py-3 text-center">
              <p className="text-sm font-medium text-slate-700">
                Select a chat to read and reply
              </p>
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {!selected ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Pick a conversation from the list
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                No messages yet
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.direction === "out"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-900 shadow-sm"
                    }`}
                  >
                    <ChatMessageBody content={msg.content} />
                    {msg.direction === "out" && (
                      <MessageStatusBadge
                        status={msg.status}
                        errorMessage={msg.status_error_message}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {selected && (
            <>
              {sendError && (
                <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-800">
                  {sendError}
                </div>
              )}
              <ConversationComposer
                conversation={selected}
                windowStatus={selectedWindowStatus}
                isManual={isManual}
                sending={sending}
                onSendingChange={setSending}
                onSent={refreshAfterSend}
                onError={setSendError}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
