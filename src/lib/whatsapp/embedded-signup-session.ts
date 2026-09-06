export type EmbeddedSignupAssets = {
  phone_number_id: string;
  waba_id: string;
};

declare global {
  interface Window {
    __waSignup?: EmbeddedSignupAssets;
  }
}

function isFacebookOrigin(origin: string): boolean {
  return origin === "https://www.facebook.com" || origin === "https://web.facebook.com"
    || origin.endsWith(".facebook.com");
}

/** Parse WA_EMBEDDED_SIGNUP postMessage (v2–v4 payload shapes). */
export function parseEmbeddedSignupMessage(
  raw: unknown
): EmbeddedSignupAssets | null {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || typeof data !== "object") return null;
    const event = data as {
      type?: string;
      data?: Record<string, unknown>;
      phone_number_id?: unknown;
      waba_id?: unknown;
    };
    if (event.type && event.type !== "WA_EMBEDDED_SIGNUP") return null;

    const payload =
      event.data && typeof event.data === "object" ? event.data : event;
    const phone_number_id =
      typeof payload.phone_number_id === "string"
        ? payload.phone_number_id
        : undefined;
    const waba_id =
      typeof payload.waba_id === "string" ? payload.waba_id : undefined;
    if (!phone_number_id || !waba_id) return null;
    return { phone_number_id, waba_id };
  } catch {
    return null;
  }
}

export function readEmbeddedSignupFromMessageEvent(
  event: MessageEvent
): EmbeddedSignupAssets | null {
  if (!isFacebookOrigin(event.origin)) return null;
  return parseEmbeddedSignupMessage(event.data);
}

/**
 * Wait until Facebook posts WABA + phone IDs, or timeout.
 * FB.login often resolves before the session-info postMessage.
 */
export function waitForEmbeddedSignupAssets(
  timeoutMs = 2500
): Promise<EmbeddedSignupAssets | null> {
  const existing = window.__waSignup;
  if (existing?.phone_number_id && existing?.waba_id) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    const finish = (assets: EmbeddedSignupAssets | null) => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(assets);
    };

    const timer = window.setTimeout(() => {
      const latest = window.__waSignup;
      finish(
        latest?.phone_number_id && latest?.waba_id ? latest : null
      );
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      const assets = readEmbeddedSignupFromMessageEvent(event);
      if (!assets) return;
      window.__waSignup = assets;
      finish(assets);
    }

    window.addEventListener("message", onMessage);
  });
}
