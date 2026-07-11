"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupportMessage } from "@/lib/support/chat";

export function SupportChatPanel() {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch("/api/store/support-chat");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load chat");
      setMessages(data.messages ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chat");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 15000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function clearChat() {
    if (clearing) return;
    if (
      !confirm(
        "Clear this chat from your view? Support can still see it until they clear on their side. When both clear, the chat is removed."
      )
    ) {
      return;
    }
    setClearing(true);
    setError(null);
    try {
      const res = await fetch("/api/store/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to clear chat");
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear chat");
    } finally {
      setClearing(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/store/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      setContent("");
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
      } else {
        await load(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[min(70vh,640px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <p className="font-semibold text-slate-900">Support chat</p>
          <p className="text-xs text-slate-600">
            Message the Arabia AI team — we typically reply within one business
            day.
          </p>
        </div>
        <button
          type="button"
          disabled={clearing || loading}
          onClick={clearChat}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {clearing ? "Clearing..." : "Clear chat"}
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-sm text-slate-500">Loading conversation...</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-500">
            No messages yet. Send a note and we&apos;ll get back to you.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === "reseller";
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                    mine
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  <p
                    className={`mt-1 text-[10px] ${
                      mine ? "text-emerald-100" : "text-slate-500"
                    }`}
                  >
                    {mine ? "You" : "Support"} ·{" "}
                    {new Date(m.created_at).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <form
        onSubmit={send}
        className="flex gap-2 border-t border-slate-200 px-4 py-3"
      >
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write a message..."
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
        <button
          type="submit"
          disabled={sending || !content.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}
