"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatMessageBody } from "@/components/ChatMessageBody";
import type { WhatsappConversation, WhatsappMessage } from "@/lib/types";

type InboxFilter = "all" | "ai" | "handoff" | "exhausted";

const FILTER_LABELS: Record<InboxFilter, string> = {
  all: "All",
  ai: "AI handling",
  handoff: "Human",
  exhausted: "AI exhausted",
};

function displayName(conv: WhatsappConversation): string {
  const name = conv.customer_name?.trim();
  if (name) return name;
  return `+${conv.customer_phone}`;
}

export function InboxPanel() {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [conversations, setConversations] = useState<WhatsappConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ filter });
    if (debouncedSearch) params.set("q", debouncedSearch);
    const res = await fetch(`/api/inbox?${params}`);
    const data = await res.json();
    const list = (data.conversations ?? []) as WhatsappConversation[];
    setConversations(list);
    setLoading(false);
    setSelectedId((prev) => {
      if (list.length && !list.some((c) => c.id === prev)) {
        return list[0].id;
      }
      if (!list.length) return null;
      return prev;
    });
    if (!list.length) {
      setMessages([]);
    }
  }, [filter, debouncedSearch]);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (selectedId) {
      setSendError(null);
      void fetchMessages(selectedId);
    }
  }, [selectedId]);

  async function fetchMessages(conversationId: string) {
    const res = await fetch(
      `/api/inbox/messages?conversationId=${conversationId}`
    );
    const data = await res.json();
    setMessages(data.messages ?? []);
  }

  async function sendReply(newStatus?: "ai_handling" | "closed") {
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedId,
          message: reply.trim(),
          newStatus,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to send message"
        );
      }
      setReply("");
      await fetchMessages(selectedId);
      await fetchConversations();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
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
      await fetchConversations();
    } finally {
      setSwitchingMode(false);
    }
  }

  async function deleteConversation() {
    if (!selectedId) return;
    const conv = conversations.find((c) => c.id === selectedId);
    if (!conv) return;
    const label = displayName(conv);
    if (
      !confirm(
        `Delete chat with ${label}? This removes the conversation and all messages from the portal. It does not delete messages on the customer's WhatsApp.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/inbox/conversations/${selectedId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to delete chat"
        );
      }
      setSelectedId(null);
      setMessages([]);
      setReply("");
      await fetchConversations();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to delete chat");
    } finally {
      setDeleting(false);
    }
  }

  function statusLabel(status: WhatsappConversation["status"]) {
    if (status === "human_handoff") return "Human";
    if (status === "ai_handling") return "AI";
    return status;
  }

  const selected = conversations.find((c) => c.id === selectedId);
  const isManual = selected?.status === "human_handoff";

  const emptyHint = useMemo(() => {
    if (debouncedSearch) {
      return "No conversations match your search.";
    }
    return "Send a test message to your business number. If nothing appears, check Integrations → WhatsApp — your webhook URL in Meta must point to your live site (not localhost).";
  }, [debouncedSearch]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(FILTER_LABELS) as InboxFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                filter === key
                  ? "bg-blue-600 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {FILTER_LABELS[key]}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            aria-label="Search conversations"
          />
        </div>
      </div>

      {loading && conversations.length === 0 ? (
        <p className="text-slate-600">Loading inbox...</p>
      ) : conversations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <p className="text-base font-medium text-slate-800">
            {debouncedSearch ? "No matches" : "No WhatsApp conversations yet"}
          </p>
          <p className="mt-2 text-sm text-slate-600">{emptyHint}</p>
        </div>
      ) : (
        <div className="flex h-[calc(100vh-16rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                type="button"
                onClick={() => setSelectedId(conv.id)}
                className={`block w-full border-b border-slate-200 px-4 py-3 text-left transition-colors hover:bg-white ${
                  selectedId === conv.id
                    ? "border-l-4 border-l-blue-600 bg-white"
                    : "border-l-4 border-l-transparent"
                }`}
              >
                <p className="truncate text-sm font-semibold text-slate-900">
                  {displayName(conv)}
                </p>
                {conv.customer_name?.trim() ? (
                  <p className="truncate text-xs text-slate-500">
                    +{conv.customer_phone}
                  </p>
                ) : null}
                <p
                  className={`mt-0.5 text-xs font-medium ${
                    conv.status === "human_handoff"
                      ? "text-amber-700"
                      : "text-slate-600"
                  }`}
                >
                  {statusLabel(conv.status)}
                </p>
              </button>
            ))}
          </div>

          <div className="flex flex-1 flex-col bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {selected ? displayName(selected) : "Select conversation"}
                  </p>
                  {selected && (
                    <p className="mt-0.5 text-xs text-slate-600">
                      {selected.customer_name?.trim()
                        ? `+${selected.customer_phone} · `
                        : ""}
                      {isManual
                        ? "You are replying — AI is paused for this chat"
                        : "AI is handling replies automatically"}
                    </p>
                  )}
                </div>

                {selected && (
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isManual
                          ? "bg-amber-100 text-amber-900"
                          : "bg-emerald-100 text-emerald-900"
                      }`}
                    >
                      {isManual ? "Human" : "AI"}
                    </span>
                    {isManual ? (
                      <button
                        type="button"
                        onClick={() => switchMode("ai")}
                        disabled={switchingMode || deleting}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {switchingMode ? "Switching..." : "Switch to AI"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => switchMode("manual")}
                        disabled={switchingMode || deleting}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {switchingMode ? "Switching..." : "Take over (Human)"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={deleteConversation}
                      disabled={deleting || switchingMode}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      {deleting ? "Deleting..." : "Delete chat"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.direction === "out"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-900 shadow-sm"
                    }`}
                  >
                    <ChatMessageBody content={msg.content} />
                  </div>
                </div>
              ))}
            </div>

            {selected && (
              <div className="border-t border-slate-200 bg-white p-4">
                {sendError && (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {sendError}
                  </div>
                )}
                {isManual && (
                  <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Human mode: reply below. The AI will not respond until you
                    switch back to AI.
                  </p>
                )}
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={
                    isManual
                      ? "Type your reply..."
                      : "Type a reply (optional — AI is handling this chat)"
                  }
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => sendReply()}
                    disabled={sending || !reply.trim()}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    Send
                  </button>
                  {isManual ? (
                    <button
                      type="button"
                      onClick={() => sendReply("ai_handling")}
                      disabled={sending || !reply.trim()}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      Send & switch to AI
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => sendReply("ai_handling")}
                      disabled={sending || !reply.trim()}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Send & keep AI on
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => sendReply("closed")}
                    disabled={sending || !reply.trim()}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Send & close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
