export type WindowType = "service" | "free_entry_point";
export type WindowUrgency = "safe" | "closing_soon" | "closed";

export interface WindowStatus {
  isOpen: boolean;
  expiresAt: Date | null;
  hoursRemaining: number;
  msRemaining: number;
  urgency: WindowUrgency;
}

export const SERVICE_WINDOW_HOURS = 24;
export const FREE_ENTRY_WINDOW_HOURS = 72;
export const CLOSING_SOON_MS = 2 * 60 * 60 * 1000;

export function windowHoursForType(windowType: WindowType | null | undefined): number {
  return windowType === "free_entry_point"
    ? FREE_ENTRY_WINDOW_HOURS
    : SERVICE_WINDOW_HOURS;
}

/**
 * Derive WhatsApp messaging window status from stored fields.
 * Never store time remaining — always compute at read time.
 */
export function getWindowStatus(
  lastCustomerMessageAt: string | Date | null | undefined,
  windowType: WindowType | null | undefined,
  now: Date = new Date()
): WindowStatus {
  if (!lastCustomerMessageAt) {
    return {
      isOpen: false,
      expiresAt: null,
      hoursRemaining: 0,
      msRemaining: 0,
      urgency: "closed",
    };
  }

  const startedAt =
    lastCustomerMessageAt instanceof Date
      ? lastCustomerMessageAt
      : new Date(lastCustomerMessageAt);

  if (Number.isNaN(startedAt.getTime())) {
    return {
      isOpen: false,
      expiresAt: null,
      hoursRemaining: 0,
      msRemaining: 0,
      urgency: "closed",
    };
  }

  const hours = windowHoursForType(windowType);
  const expiresAt = new Date(startedAt.getTime() + hours * 60 * 60 * 1000);
  const msRemaining = Math.max(0, expiresAt.getTime() - now.getTime());
  const isOpen = msRemaining > 0;
  const hoursRemaining = msRemaining / (60 * 60 * 1000);

  let urgency: WindowUrgency = "closed";
  if (isOpen) {
    urgency = msRemaining <= CLOSING_SOON_MS ? "closing_soon" : "safe";
  }

  return {
    isOpen,
    expiresAt,
    hoursRemaining,
    msRemaining,
    urgency,
  };
}

/** Format ms remaining as "18h 42m" or "47m" for badge display. */
export function formatWindowCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return "Template required";

  const totalMinutes = Math.ceil(msRemaining / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m left` : `${hours}h left`;
  }
  return `${Math.max(minutes, 1)}m left`;
}
