"use client";

import { useEffect, useState } from "react";
import type { WhatsappConversation, WhatsappMessage } from "@/lib/types";

type InboxFilter = "all" | "ai" | "handoff";

const FILTER_LABELS: Record<InboxFilter, string> = {
  all: "All",
  ai: "AI handling",
  handoff: "Needs you",
};

export function InboxPanel() {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [conversations, setConversations] = useState<WhatsappConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
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

  function statusLabel(status: WhatsappConversation["status"]) {
    if (status === "human_handoff") return "Needs you";
    if (status === "ai_handling") return "AI";
    return status;
  }

  const selected = conversations.find((c) => c.id === selectedId);

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
              <p className="font-semibold text-slate-900">
                {selected ? `+${selected.customer_phone}` : "Select conversation"}
              </p>
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
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type your reply..."
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
                  <button
                    onClick={() => sendReply("ai_handling")}
                    disabled={sending || !reply.trim()}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Send & return to AI
                  </button>
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
