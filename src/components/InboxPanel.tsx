"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatMessageBody } from "@/components/ChatMessageBody";
import { createClient } from "@/lib/supabase/client";
import type { WhatsappConversation, WhatsappMessage } from "@/lib/types";
import { ConversationComposer } from "@/components/whatsapp-window/ConversationComposer";
import { ConversationListRow } from "@/components/whatsapp-window/ConversationListRow";
import { WindowCountdownBadge } from "@/components/whatsapp-window/WindowCountdownBadge";
import { useWindowCountdown } from "@/components/whatsapp-window/useWindowCountdown";

type InboxFilter = "all" | "ai" | "handoff" | "exhausted" | "closing_soon";

const FILTER_LABELS: Record<InboxFilter, string> = {
  all: "All",
  ai: "AI handling",
  handoff: "Human",
  exhausted: "AI exhausted",
  closing_soon: "Closing soon",
};

function displayName(conv: WhatsappConversation): string {
  const name = conv.customer_name?.trim();
  if (name) return name;
  return `+${conv.customer_phone}`;
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
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">
              {displayName(selected)}
            </p>
            <WindowCountdownBadge status={windowStatus} size="lg" />
          </div>
          <p className="mt-0.5 text-xs text-slate-600">
            {selected.customer_name?.trim()
              ? `+${selected.customer_phone} · `
              : ""}
            {selected.window_type === "free_entry_point"
              ? "72h CTWA window · "
              : "24h service window · "}
            {isManual
              ? "You are replying — AI is paused for this chat"
              : "AI is handling replies automatically"}
          </p>
        </div>

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
              onClick={() => onSwitchMode("ai")}
              disabled={switchingMode || deleting}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {switchingMode ? "Switching..." : "Switch to AI"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSwitchMode("manual")}
              disabled={switchingMode || deleting}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {switchingMode ? "Switching..." : "Take over (Human)"}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting || switchingMode}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete chat"}
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
  const [conversations, setConversations] = useState<WhatsappConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
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
        return list[0]!.id;
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
          void fetchConversations();
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
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        () => {
          void fetchMessages(selectedId);
          void fetchConversations();
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
    await fetchConversations();
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
      await fetchConversations();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to delete chat");
    } finally {
      setDeleting(false);
    }
  }

  const selected = conversations.find((c) => c.id === selectedId);
  const isManual = selected?.status === "human_handoff";

  const selectedWindowStatus = useWindowCountdown(
    selected?.last_customer_message_at,
    selected?.window_type ?? "service"
  );

  const emptyHint = useMemo(() => {
    if (debouncedSearch) {
      return "No conversations match your search.";
    }
    if (filter === "closing_soon") {
      return "No conversations are in the closing-soon window right now.";
    }
    return "Send a test message to your business number. If nothing appears, check Integrations → WhatsApp — your webhook URL in Meta must point to your live site (not localhost).";
  }, [debouncedSearch, filter]);

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
            {debouncedSearch || filter !== "all" ? "No matches" : "No WhatsApp conversations yet"}
          </p>
          <p className="mt-2 text-sm text-slate-600">{emptyHint}</p>
        </div>
      ) : (
        <div className="flex h-[calc(100vh-16rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50">
            {conversations.map((conv) => (
              <ConversationListRow
                key={conv.id}
                conv={conv}
                selected={selectedId === conv.id}
                onSelect={() => setSelectedId(conv.id)}
                onFollowUpSent={() => void refreshAfterSend()}
              />
            ))}
          </div>

          <div className="flex flex-1 flex-col bg-white">
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
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">Select conversation</p>
              </div>
            )}

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
      )}
    </div>
  );
}
