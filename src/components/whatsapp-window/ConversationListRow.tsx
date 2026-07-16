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
}: {
  conv: WhatsappConversation;
  selected: boolean;
  onSelect: () => void;
  onFollowUpSent?: () => void;
}) {
  const windowStatus = useWindowCountdown(
    conv.last_customer_message_at,
    conv.window_type ?? "service"
  );

  return (
    <div
      className={`flex w-full items-start gap-1 border-b border-slate-200 transition-colors hover:bg-white ${
        selected
          ? "border-l-4 border-l-blue-600 bg-white"
          : "border-l-4 border-l-transparent"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
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
      <div className="shrink-0 py-3 pr-2">
        <FollowUpButton
          conversation={conv}
          windowStatus={windowStatus}
          variant="compact"
          onSent={onFollowUpSent}
        />
      </div>
    </div>
  );
}
