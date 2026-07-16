import {
  getWindowStatus,
  type WindowType,
} from "@/lib/whatsapp-window/window-status";

export type WhatsAppReferral = {
  ctwa_clid?: string;
  source_type?: string;
};

export function isCtwaReferral(referral?: WhatsAppReferral | null): boolean {
  if (!referral) return false;
  if (referral.ctwa_clid?.trim()) return true;
  return referral.source_type?.trim().toLowerCase() === "ad";
}

/** Decide window_type when an inbound message arrives (before updating last_customer_message_at). */
export function resolveWindowTypeOnInbound(params: {
  isNewConversation: boolean;
  lastCustomerMessageAt: string | null;
  currentWindowType: WindowType | null;
  isAdReferral: boolean;
  now?: Date;
}): WindowType {
  const wasClosed =
    params.isNewConversation ||
    !params.lastCustomerMessageAt ||
    !getWindowStatus(
      params.lastCustomerMessageAt,
      params.currentWindowType ?? "service",
      params.now
    ).isOpen;

  if (params.isAdReferral && wasClosed) {
    return "free_entry_point";
  }
  return "service";
}

export function inboundMessagePreview(type: string, textBody?: string): string {
  if (type === "text" && textBody?.trim()) return textBody.trim();
  const label = type.replace(/_/g, " ");
  return `[${label}]`;
}
