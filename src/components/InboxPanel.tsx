"use client";

import { useEffect, useState } from "react";
import type { WhatsappConversation, WhatsappMessage } from "@/lib/types";

type InboxFilter = "all" | "ai" | "handoff";

const FILTER_LABELS: Record<InboxFilter, string> = {
  all: "All",
  ai: "AI handling",
  handoff: "Manual",
};

export function InboxPanel() {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [conversations, setConversations] = useState<WhatsappConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversations();
  }, [filter]);

  useEffect(() => {
    if (selectedId) fetchMessages(selectedId);
  }, [selectedId]);

  async function fetchConversations() {
    setLoading(true);
    const res = await fetch(`/api/inbox?filter=${filter}`);
    const data = await res.json();
    const list = data.conversations ?? [];
    setConversations(list);
    setLoading(false);
    if (list.length && !list.some((c: WhatsappConversation) => c.id === selectedId)) {
      setSelectedId(list[0].id);
    }
    if (!list.length) {
      setSelectedId(null);
      setMessages([]);
    }
  }

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
    await fetch("/api/inbox/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: selectedId,
        message: reply,
        newStatus,
      }),
    });
    setReply("");
    await fetchMessages(selectedId);
    await fetchConversations();
    setSending(false);
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

  function statusLabel(status: WhatsappConversation["status"]) {
    if (status === "human_handoff") return "Manual";
    if (status === "ai_handling") return "AI";
    return status;
  }

  const selected = conversations.find((c) => c.id === selectedId);
  const isManual = selected?.status === "human_handoff";

  if (loading) {
    return <p className="text-slate-600">Loading inbox...</p>;
  }

  return (
    <div className="space-y-4">
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

      {conversations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <p className="text-base font-medium text-slate-800">
            No WhatsApp conversations yet
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Send a test message to your business number. If nothing appears, check
            Integrations → WhatsApp — your webhook URL in Meta must point to your
            live site (not localhost).
          </p>
        </div>
      ) : (
        <div className="flex h-[calc(100vh-14rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={`block w-full border-b border-slate-200 px-4 py-3 text-left transition-colors hover:bg-white ${
                  selectedId === conv.id
                    ? "border-l-4 border-l-blue-600 bg-white"
                    : "border-l-4 border-l-transparent"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">
                  +{conv.customer_phone}
                </p>
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
                    {selected ? `+${selected.customer_phone}` : "Select conversation"}
                  </p>
                  {selected && (
                    <p className="mt-0.5 text-xs text-slate-600">
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
                      {isManual ? "Manual" : "AI"}
                    </span>
                    {isManual ? (
                      <button
                        type="button"
                        onClick={() => switchMode("ai")}
                        disabled={switchingMode}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {switchingMode ? "Switching..." : "Switch to AI"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => switchMode("manual")}
                        disabled={switchingMode}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {switchingMode ? "Switching..." : "Take over manually"}
                      </button>
                    )}
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
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>

            {selected && (
              <div className="border-t border-slate-200 bg-white p-4">
                {isManual && (
                  <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Manual mode: reply below. The AI will not respond until you
                    switch back to AI.
                  </p>
                )}
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={
                    isManual
                      ? "Type your manual reply..."
                      : "Type a reply (optional — AI is handling this chat)"
                  }
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => sendReply()}
                    disabled={sending || !reply.trim()}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    Send
                  </button>
                  {isManual ? (
                    <button
                      onClick={() => sendReply("ai_handling")}
                      disabled={sending || !reply.trim()}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      Send & switch to AI
                    </button>
                  ) : (
                    <button
                      onClick={() => sendReply("ai_handling")}
                      disabled={sending || !reply.trim()}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Send & keep AI on
                    </button>
                  )}
                  <button
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
