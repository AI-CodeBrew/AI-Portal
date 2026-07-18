"use client";

import type { WhatsappConversation } from "@/lib/types";
import { FollowUpButton } from "@/components/whatsapp-window/FollowUpButton";
import { WindowCountdownBadge } from "@/components/whatsapp-window/WindowCountdownBadge";
import { useWindowCountdown } from "@/components/whatsapp-window/useWindowCountdown";

function displayName(conv: WhatsappConversation): string {
  const name = conv.customer_name?.trim();
  if (name) return name;
  return `+${conv.customer_phone}`;
}

export function ConversationListRow({
  conv,
  selected,
  onSelect,
  onFollowUpSent,
  selectionMode = false,
  checked = false,
  onToggleSelect,
}: {
  conv: WhatsappConversation;
  selected: boolean;
  onSelect: () => void;
  onFollowUpSent?: () => void;
  selectionMode?: boolean;
  checked?: boolean;
  onToggleSelect?: () => void;
}) {
  const windowStatus = useWindowCountdown(
    conv.last_customer_message_at,
    conv.window_type ?? "service"
  );

  return (
    <div
      className={`flex w-full items-start gap-1 border-b border-slate-200 transition-colors hover:bg-white ${
        selected && !selectionMode
          ? "border-l-4 border-l-blue-600 bg-white"
          : checked
            ? "border-l-4 border-l-red-400 bg-red-50/40"
            : "border-l-4 border-l-transparent"
      }`}
    >
      {selectionMode ? (
        <label className="flex shrink-0 items-start px-3 py-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggleSelect?.()}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
            aria-label={`Select chat with ${displayName(conv)}`}
          />
        </label>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (selectionMode) {
            onToggleSelect?.();
            return;
          }
          onSelect();
        }}
        className="min-w-0 flex-1 px-4 py-3 text-left"
      >
        <p className="truncate text-sm font-semibold text-slate-900">
          {displayName(conv)}
        </p>
        {conv.customer_name?.trim() ? (
          <p className="truncate text-xs text-slate-500">
            +{conv.customer_phone}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <WindowCountdownBadge status={windowStatus} />
          <span
            className={`text-xs font-medium ${
              conv.status === "human_handoff"
                ? "text-amber-700"
                : "text-slate-600"
            }`}
          >
            {conv.status === "human_handoff" ? "Human" : "AI"}
          </span>
        </div>
      </button>
      {!selectionMode ? (
        <div className="shrink-0 py-3 pr-2">
          <FollowUpButton
            conversation={conv}
            windowStatus={windowStatus}
            variant="compact"
            onSent={onFollowUpSent}
          />
        </div>
      ) : null}
    </div>
  );
}
