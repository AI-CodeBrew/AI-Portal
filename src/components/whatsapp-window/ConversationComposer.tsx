"use client";

import { useState } from "react";
import type { WhatsappConversation } from "@/lib/types";
import type { WindowStatus } from "@/lib/whatsapp-window/window-status";
import { FollowUpButton } from "@/components/whatsapp-window/FollowUpButton";
import {
  TemplatePicker,
  useApprovedTemplates,
} from "@/components/whatsapp-window/TemplatePicker";
import { InboxManualTools } from "@/components/whatsapp-window/InboxManualTools";

export function ConversationComposer({
  conversation,
  windowStatus,
  isManual,
  sending,
  onSendingChange,
  onSent,
  onError,
}: {
  conversation: WhatsappConversation;
  windowStatus: WindowStatus;
  isManual: boolean;
  sending: boolean;
  onSendingChange: (v: boolean) => void;
  onSent: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [reply, setReply] = useState("");
  const [templateId, setTemplateId] = useState("");
  const { templates, loading: templatesLoading } = useApprovedTemplates();

  const windowOpen = windowStatus.isOpen;

  async function sendFreeform(newStatus?: "ai_handling" | "closed") {
    const text = reply.trim();
    if (!text) return;
    onSendingChange(true);
    onError(null);
    try {
      const res = await fetch("/api/messages/send-freeform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversation.id,
          message: text,
          newStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to send message"
        );
      }
      setReply("");
      await onSent();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      onSendingChange(false);
    }
  }

  async function sendTemplate(newStatus?: "ai_handling" | "closed") {
    const id = templateId || templates[0]?.id;
    if (!id) {
      onError("Select an approved template");
      return;
    }
    onSendingChange(true);
    onError(null);
    try {
      const res = await fetch("/api/messages/send-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversation.id,
          templateId: id,
          newStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to send template"
        );
      }
      await onSent();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to send template");
    } finally {
      onSendingChange(false);
    }
  }

  if (!windowOpen) {
    return (
      <div className="border-t border-slate-200 bg-white p-4">
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          The messaging window has closed. Free-text replies are disabled — send
          an approved WhatsApp template below.
        </div>
        <TemplatePicker
          templates={templates}
          templateId={templateId || templates[0]?.id || ""}
          onTemplateIdChange={setTemplateId}
          loading={templatesLoading}
          context={{
            customerName: conversation.customer_name,
            marketingOptIn: conversation.marketing_opt_in,
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => sendTemplate()}
            disabled={sending || templates.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Send template
          </button>
          <FollowUpButton
            conversation={conversation}
            windowStatus={windowStatus}
            onSent={() => void onSent()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-200 bg-white p-4">
      {isManual && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Human mode: reply below. The AI will not respond until you switch back
          to AI.
        </p>
      )}
      {isManual && (
        <InboxManualTools
          conversation={conversation}
          windowOpen={windowOpen}
          busy={sending}
          onBusyChange={onSendingChange}
          onSent={onSent}
          onError={onError}
        />
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
          onClick={() => sendFreeform()}
          disabled={sending || !reply.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
        {isManual ? (
          <button
            type="button"
            onClick={() => sendFreeform("ai_handling")}
            disabled={sending || !reply.trim()}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
          >
            Send & switch to AI
          </button>
        ) : (
          <button
            type="button"
            onClick={() => sendFreeform("ai_handling")}
            disabled={sending || !reply.trim()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Send & keep AI on
          </button>
        )}
        <button
          type="button"
          onClick={() => sendFreeform("closed")}
          disabled={sending || !reply.trim()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          Send & close
        </button>
        <FollowUpButton
          conversation={conversation}
          windowStatus={windowStatus}
          onSent={() => void onSent()}
        />
      </div>
    </div>
  );
}
