"use client";

import {
  formatWindowCountdown,
  type WindowStatus,
} from "@/lib/whatsapp-window/window-status";

const STYLES = {
  safe: "bg-emerald-100 text-emerald-800 border-emerald-200",
  closing_soon: "bg-amber-100 text-amber-900 border-amber-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
} as const;

export function WindowCountdownBadge({
  status,
  size = "sm",
  className = "",
}: {
  status: WindowStatus;
  size?: "sm" | "lg";
  className?: string;
}) {
  const label =
    status.urgency === "closed"
      ? "Template required"
      : formatWindowCountdown(status.msRemaining);

  const sizeClass =
    size === "lg"
      ? "px-3 py-1 text-sm font-semibold"
      : "px-2 py-0.5 text-[11px] font-semibold";

  return (
    <span
      className={`inline-flex items-center rounded-full border ${sizeClass} ${STYLES[status.urgency]} ${className}`}
      title={
        status.expiresAt
          ? `Window expires ${status.expiresAt.toLocaleString()}`
          : "No inbound message yet — templates only"
      }
    >
      {label}
    </span>
  );
}
