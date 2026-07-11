"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdminResellerRow } from "@/lib/admin/resellers";
import type { SupportConversation, SupportMessage } from "@/lib/support/chat";

function storeLabel(r: AdminResellerRow): string {
  return (
    r.store?.store_name ||
    r.store?.shop_domain ||
    r.full_name ||
    r.email
  );
}

export function AdminSupportChatPanel({
  resellers,
}: {
  resellers: AdminResellerRow[];
}) {
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const unreadByStore = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of conversations) {
      map.set(c.store_id, c.admin_unread);
    }
    return map;
  }, [conversations]);

  const lastMessageAtByStore = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations) {
      map.set(c.store_id, c.last_message_at);
    }
    return map;
  }, [conversations]);

  /** Unread chats first, then most recent activity. */
  const withStore = useMemo(() => {
    const list = resellers.filter((r) => r.store_id);
    return list.sort((a, b) => {
      const aUnread = unreadByStore.get(a.store_id!) ? 1 : 0;
      const bUnread = unreadByStore.get(b.store_id!) ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      const aAt = lastMessageAtByStore.get(a.store_id!) ?? "";
      const bAt = lastMessageAtByStore.get(b.store_id!) ?? "";
      if (aAt !== bAt) return bAt.localeCompare(aAt);
      return storeLabel(a).localeCompare(storeLabel(b));
    });
  }, [resellers, unreadByStore, lastMessageAtByStore]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/support-chat");
      const data = await res.json();
      if (res.ok) setConversations(data.conversations ?? []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadChat = useCallback(async (storeId: string, quiet = false) => {
    if (!storeId) return;
    if (!quiet) setLoadingChat(true);
    try {
      const res = await fetch(`/api/admin/support-chat?storeId=${storeId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load chat");
      setMessages(data.messages ?? []);
      setError(null);
      void loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chat");
    } finally {
      if (!quiet) setLoadingChat(false);
    }
  }, [loadConversations]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedStoreId) return;
    loadChat(selectedStoreId);
    const interval = setInterval(() => loadChat(selectedStoreId, true), 15000);
    return () => clearInterval(interval);
  }, [selectedStoreId, loadChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function clearChat() {
    if (!selectedStoreId || clearing) return;
    if (
      !confirm(
        "Clear this chat from your view? The reseller can still see it until they clear on their side. When both clear, the chat is removed from the database."
      )
    ) {
      return;
    }
    setClearing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStoreId, action: "clear" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to clear chat");
      setMessages([]);
      void loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear chat");
    } finally {
      setClearing(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStoreId || !content.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStoreId,
          content: content.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      setContent("");
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
      } else {
        await loadChat(selectedStoreId, true);
      }
      void loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-sm font-semibold text-slate-900">Resellers</p>
          <p className="text-xs text-slate-600">Pick a store to chat</p>
        </div>
        <ul className="max-h-[min(70vh,640px)] overflow-y-auto divide-y divide-slate-100">
          {loadingList && withStore.length === 0 ? (
            <li className="px-3 py-6 text-sm text-slate-500">Loading...</li>
          ) : (
            withStore.map((r) => {
              const storeId = r.store_id!;
              const active = selectedStoreId === storeId;
              const unread = unreadByStore.get(storeId);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedStoreId(storeId)}
                    className={`flex w-full items-start gap-2 px-3 py-3 text-left text-sm transition ${
                      active
                        ? "bg-violet-50 text-violet-950"
                        : unread
                          ? "bg-violet-50/60 hover:bg-violet-50 text-slate-900"
                          : "hover:bg-slate-50 text-slate-800"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate ${
                          unread ? "font-bold" : "font-semibold"
                        }`}
                      >
                        {storeLabel(r)}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {r.email}
                      </span>
                    </span>
                    {unread && (
                      <span className="mt-0.5 shrink-0 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        New
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <div className="flex h-[min(70vh,640px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {!selectedStoreId ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
            Select a reseller to open support chat
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <p className="font-semibold text-slate-900">
                  {storeLabel(
                    withStore.find((r) => r.store_id === selectedStoreId)!
                  )}
                </p>
                <p className="text-xs text-slate-600">
                  Admin ↔ reseller support
                </p>
              </div>
              <button
                type="button"
                disabled={clearing || loadingChat}
                onClick={clearChat}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {clearing ? "Clearing..." : "Clear chat"}
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {loadingChat ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No messages yet. Say hello to start the thread.
                </p>
              ) : (
                messages.map((m) => {
                  const mine = m.sender_role === "admin";
                  return (
                    <div
                      key={m.id}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                          mine
                            ? "bg-violet-600 text-white"
                            : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            mine ? "text-violet-100" : "text-slate-500"
                          }`}
                        >
                          {mine ? "You" : "Reseller"} ·{" "}
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
                placeholder="Reply as support..."
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
              <button
                type="submit"
                disabled={sending || !content.trim()}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
