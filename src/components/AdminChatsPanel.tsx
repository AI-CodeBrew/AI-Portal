"use client";

import { useEffect, useState } from "react";
import type { AdminResellerRow } from "@/lib/admin/resellers";
import type { WhatsappConversation, WhatsappMessage } from "@/lib/types";

function resellerLabel(r: AdminResellerRow): string {
  return (
    r.full_name ||
    r.store?.store_name ||
    r.store?.shop_domain ||
    r.email
  );
}

function conversationStatusLabel(status: WhatsappConversation["status"]) {
  if (status === "human_handoff") return "Needs reseller";
  if (status === "ai_handling") return "AI";
  return status;
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

  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(
    validInitial
  );
  const [conversations, setConversations] = useState<WhatsappConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    if (!selectedStoreId) {
      setConversations([]);
      setSelectedConversationId(null);
      setMessages([]);
      return;
    }

    setLoadingConversations(true);
    fetch(`/api/admin/chats?storeId=${selectedStoreId}`)
      .then((res) => res.json())
      .then((data) => {
        const list = data.conversations ?? [];
        setConversations(list);
        setSelectedConversationId(list[0]?.id ?? null);
      })
      .finally(() => setLoadingConversations(false));
  }, [selectedStoreId]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    fetch(
      `/api/admin/chats/messages?conversationId=${selectedConversationId}`
    )
      .then((res) => res.json())
      .then((data) => setMessages(data.messages ?? []))
      .finally(() => setLoadingMessages(false));
  }, [selectedConversationId]);

  const selectedReseller = resellersWithStore.find(
    (r) => r.store_id === selectedStoreId
  );
  const selectedConversation = conversations.find(
    (c) => c.id === selectedConversationId
  );

  return (
    <div className="flex h-[calc(100vh-12rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Resellers */}
      <div className="w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50">
        <div className="border-b border-slate-200 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Resellers
          </p>
        </div>
        {resellersWithStore.length === 0 ? (
          <p className="px-3 py-6 text-sm text-slate-600">No resellers yet</p>
        ) : (
          resellersWithStore.map((r) => {
            const active = selectedStoreId === r.store_id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedStoreId(r.store_id!)}
                className={`block w-full border-b border-slate-200 px-3 py-3 text-left text-sm transition-colors hover:bg-white ${
                  active
                    ? "border-l-4 border-l-violet-600 bg-white font-semibold text-violet-700"
                    : "border-l-4 border-l-transparent text-slate-700"
                }`}
              >
                {resellerLabel(r)}
                <span className="mt-0.5 block truncate text-xs font-normal text-slate-500">
                  {r.chatCount} chat{r.chatCount === 1 ? "" : "s"}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Customers */}
      <div className="w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50">
        <div className="border-b border-slate-200 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Customers
          </p>
        </div>
        {!selectedStoreId ? (
          <p className="px-3 py-6 text-sm text-slate-600">
            Select a reseller
          </p>
        ) : loadingConversations ? (
          <p className="px-3 py-6 text-sm text-slate-600">Loading...</p>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-6 text-sm text-slate-600">No chats yet</p>
        ) : (
          conversations.map((conv) => {
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
                +{conv.customer_phone}
                <span
                  className={`mt-0.5 block text-xs font-normal ${
                    conv.status === "human_handoff"
                      ? "text-amber-700"
                      : "text-slate-500"
                  }`}
                >
                  {conversationStatusLabel(conv.status)}
                </span>
              </button>
            );
          })
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
                {selectedReseller
                  ? resellerLabel(selectedReseller)
                  : "Reseller"}{" "}
                · View only
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-600">
              Select a customer to view the chat
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
                  {msg.content}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
