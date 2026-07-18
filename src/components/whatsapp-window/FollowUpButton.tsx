"use client";

import { useState } from "react";
import type { WhatsappConversation } from "@/lib/types";
import type { WindowStatus } from "@/lib/whatsapp-window/window-status";
import {
  TemplatePicker,
  useApprovedTemplates,
} from "@/components/whatsapp-window/TemplatePicker";

type FollowUpMode = "freeform" | "template";

export function FollowUpButton({
  conversation,
  windowStatus,
  onSent,
  variant = "button",
  className = "",
}: {
  conversation: WhatsappConversation;
  windowStatus: WindowStatus;
  onSent?: () => void;
  variant?: "button" | "compact";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FollowUpMode>("freeform");
  const [message, setMessage] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { templates, loading: templatesLoading } = useApprovedTemplates();

  const windowOpen = windowStatus.isOpen;

  function openModal() {
    setError(null);
    setMessage("");
    setMode(windowOpen ? "freeform" : "template");
    if (templates.length > 0 && !templateId) {
      setTemplateId(templates[0]!.id);
    }
    setOpen(true);
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      if (mode === "freeform") {
        if (!windowOpen) {
          setError("Messaging window closed — use a template instead.");
          return;
        }
        const text = message.trim();
        if (!text) {
          setError("Enter a follow-up message");
          return;
        }
        const res = await fetch("/api/messages/send-freeform", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversation.id,
            message: text,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Send failed");
      } else {
        if (!templateId) {
          setError("Select a template");
          return;
        }
        const res = await fetch("/api/messages/send-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversation.id,
            templateId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Send failed");
      }
      setOpen(false);
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const triggerClass =
    variant === "compact"
      ? "rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
      : "rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100";

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openModal();
        }}
        className={`${triggerClass} ${className}`}
      >
        Follow up
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Follow up</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {windowOpen
                  ? "Send free text or pick an approved WhatsApp template."
                  : "Window closed — Meta requires an approved template."}
              </p>
            </div>

            <div className="space-y-3 px-5 py-5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              )}

              {windowOpen && (
                <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setMode("freeform")}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${
                      mode === "freeform"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Free text
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("template")}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${
                      mode === "template"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Template
                  </button>
                </div>
              )}

              {mode === "freeform" && windowOpen ? (
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Type your follow-up message..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              ) : (
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
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={handleSend}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send on WhatsApp"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
