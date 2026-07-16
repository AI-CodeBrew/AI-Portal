"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getWindowStatus,
  type WindowStatus,
  type WindowType,
} from "@/lib/whatsapp-window/window-status";

/** Client-side countdown — ticks every 30s, no server polling. */
export function useWindowCountdown(
  lastCustomerMessageAt: string | null | undefined,
  windowType: WindowType | null | undefined
): WindowStatus {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(
    () =>
      getWindowStatus(
        lastCustomerMessageAt,
        windowType,
        new Date(now)
      ),
    [lastCustomerMessageAt, windowType, now]
  );
}
