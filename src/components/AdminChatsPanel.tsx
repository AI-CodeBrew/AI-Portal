"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminResellerRow } from "@/lib/admin/resellers";
import type {
  AdminChatCounts,
  AdminChatFilter,
  AdminConversation,
} from "@/lib/admin/chats";
import type { WhatsappMessage } from "@/lib/types";
import { ChatMessageBody } from "@/components/ChatMessageBody";
import {
  AdminPaginationBar,
  type AdminPageSize,
} from "@/components/AdminPaginationBar";

const FILTERS: {
  value: AdminChatFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "ai", label: "AI" },
  { value: "human", label: "Human" },
  { value: "unread", label: "Unread" },
];

function resellerLabel(r: AdminResellerRow): string {
  return (
    r.full_name ||
    r.store?.store_name ||
    r.store?.shop_domain ||
    r.email
  );
}

function conversationStatusLabel(status: AdminConversation["status"]) {
  if (status === "human_handoff") return "Human";
  if (status === "ai_handling") return "AI";
  if (status === "closed") return "Closed";
  return status;
}

function storeLabel(conv: AdminConversation, resellers: AdminResellerRow[]) {
  const reseller = resellers.find((r) => r.store_id === conv.store_id);
  if (reseller) return resellerLabel(reseller);
  return conv.store_name || conv.shop_domain || "Store";
}

export function AdminChatsPanel({
  resellers,
  initialStoreId,
}: {
  resellers: AdminResellerRow[];
  initialStoreId?: string;
}) {
  const resellersWithStore = resellers.filter((r) => r.store_id);
  const validInitial =
    initialStoreId &&
    resellersWithStore.some((r) => r.store_id === initialStoreId)
      ? initialStoreId
      : null;

  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    validInitial ?? ""
  );
  const [filter, setFilter] = useState<AdminChatFilter>("all");
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [counts, setCounts] = useState<AdminChatCounts>({
    all: 0,
    ai: 0,
    human: 0,
    unread: 0,
  });
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<AdminPageSize>(10);

  const totalPages = Math.max(1, Math.ceil(conversations.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedConversations = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return conversations.slice(start, start + pageSize);
  }, [conversations, safePage, pageSize]);

  const loadConversations = useCallback(
    async (opts?: { keepSelection?: string | null }) => {
      setLoadingConversations(true);
      try {
        const params = new URLSearchParams({ filter });
        if (selectedStoreId) params.set("storeId", selectedStoreId);

        const res = await fetch(`/api/admin/chats?${params}`);
        const data = await res.json();
        const list = (data.conversations ?? []) as AdminConversation[];
        setConversations(list);
        setPage(1);
        if (data.counts) setCounts(data.counts);

        const keep = opts?.keepSelection;
        setSelectedConversationId((prev) => {
          const preferred = keep !== undefined ? keep : prev;
          if (preferred && list.some((c) => c.id === preferred)) {
            return preferred;
          }
          return null;
        });
        if (list.length === 0) setMessages([]);
      } finally {
        setLoadingConversations(false);
      }
    },
    [filter, selectedStoreId]
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setLoadingMessages(true);

    fetch(
      `/api/admin/chats/messages?conversationId=${selectedConversationId}&markRead=1`
    )
      .then((res) => res.json())
      .then(async (data) => {
        if (cancelled) return;
        setMessages(data.messages ?? []);

        if (data.markedRead) {
          const opened = conversations.find(
            (c) => c.id === selectedConversationId
          );
          const wasUnread = Boolean(opened?.unread);

          setConversations((prev) =>
            prev.map((c) =>
              c.id === selectedConversationId
                ? {
                    ...c,
                    unread: false,
                    admin_read_at: new Date().toISOString(),
                  }
                : c
            )
          );
          if (wasUnread) {
            setCounts((prev) => ({
              ...prev,
              unread: Math.max(0, prev.unread - 1),
            }));
          }

          if (filter === "unread") {
            await loadConversations({ keepSelection: null });
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedConversationId, filter, loadConversations]);

  const selectedConversation = conversations.find(
    (c) => c.id === selectedConversationId
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-sm sm:max-w-xs">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Reseller
          </span>
          <select
            value={selectedStoreId}
            onChange={(e) => {
              setSelectedStoreId(e.target.value);
              setSelectedConversationId(null);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
          >
            <option value="">All resellers</option>
            {resellersWithStore.map((r) => (
              <option key={r.id} value={r.store_id!}>
                {resellerLabel(r)}
                {r.chatCount ? ` (${r.chatCount})` : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            const count = counts[f.value];
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setFilter(f.value);
                  setSelectedConversationId(null);
                }}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-violet-600 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {f.label}
                <span
                  className={`ml-1.5 tabular-nums ${
                    active ? "text-violet-100" : "text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex h-[calc(100vh-14rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Conversations */}
        <div className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50 sm:w-80">
          <div className="border-b border-slate-200 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Conversations
              {selectedStoreId ? " · filtered by reseller" : ""}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingConversations ? (
              <p className="px-3 py-6 text-sm text-slate-600">Loading...</p>
            ) : conversations.length === 0 ? (
              <p className="px-3 py-6 text-sm text-slate-600">No chats match</p>
            ) : (
              pagedConversations.map((conv) => {
                const active = selectedConversationId === conv.id;
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setSelectedConversationId(conv.id)}
                    className={`block w-full border-b border-slate-200 px-3 py-3 text-left text-sm transition-colors hover:bg-white ${
                      active
                        ? "border-l-4 border-l-violet-600 bg-white font-semibold text-violet-700"
                        : "border-l-4 border-l-transparent text-slate-700"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate">+{conv.customer_phone}</span>
                      {conv.unread && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" />
                      )}
                    </span>
                    {!selectedStoreId && (
                      <span className="mt-0.5 block truncate text-xs font-normal text-slate-500">
                        {storeLabel(conv, resellersWithStore)}
                      </span>
                    )}
                    <span
                      className={`mt-0.5 block text-xs font-normal ${
                        conv.status === "human_handoff"
                          ? "text-amber-700"
                          : conv.unread
                            ? "text-violet-600"
                            : "text-slate-500"
                      }`}
                    >
                      {conversationStatusLabel(conv.status)}
                      {conv.unread ? " · Unread" : ""}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {conversations.length > 0 && (
            <AdminPaginationBar
              page={safePage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={conversations.length}
              itemLabel="chats"
              loading={loadingConversations}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          )}
        </div>

        {/* Chat thread */}
        <div className="flex min-w-0 flex-1 flex-col bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            {selectedConversation ? (
              <>
                <p className="font-semibold text-slate-900">
                  +{selectedConversation.customer_phone}
                </p>
                <p className="text-xs text-slate-600">
                  {storeLabel(selectedConversation, resellersWithStore)} ·{" "}
                  {conversationStatusLabel(selectedConversation.status)} ·
                  View only
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-600">
                Select a conversation to view the chat
              </p>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {loadingMessages ? (
              <p className="text-sm text-slate-600">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-slate-600">
                {selectedConversationId
                  ? "No messages in this conversation"
                  : "No conversation selected"}
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.direction === "out"
                        ? "bg-violet-600 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-900 shadow-sm"
                    }`}
                  >
                    <p className="mb-1 text-[10px] font-semibold uppercase opacity-70">
                      {msg.direction === "out" ? "Store / AI" : "Customer"}
                    </p>
                    <ChatMessageBody content={msg.content} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
