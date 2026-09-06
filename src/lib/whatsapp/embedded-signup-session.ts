export type EmbeddedSignupAssets = {
  phone_number_id: string;
  waba_id: string;
};

export type EmbeddedSignupFlowError = {
  error_code: string;
  error_message: string;
  session_id?: string;
};

/**
 * Official Embedded Signup v4 extras.
 * Do not pass extras.version: "v4" — that value is invalid and Meta's
 * GraphQL login query can fail with #1675030. v4 is selected by the
 * Facebook Login for Business configuration (products/assets), not JS.
 * @see https://developers.facebook.com/docs/whatsapp/embedded-signup/implementation
 */
export const EMBEDDED_SIGNUP_LOGIN_EXTRAS = {
  setup: {},
  sessionInfoVersion: "3",
} as const;

declare global {
  interface Window {
    __waSignup?: EmbeddedSignupAssets;
    __waSignupError?: EmbeddedSignupFlowError;
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

function parseRaw(raw: unknown): Record<string, unknown> | null {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || typeof data !== "object") return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseEmbeddedSignupError(
  raw: unknown
): EmbeddedSignupFlowError | null {
  const event = parseRaw(raw);
  if (!event) return null;
  if (event.type && event.type !== "WA_EMBEDDED_SIGNUP") return null;

  const payload =
    event.data && typeof event.data === "object"
      ? (event.data as Record<string, unknown>)
      : event;
  const error_code =
    typeof payload.error_code === "string" || typeof payload.error_code === "number"
      ? String(payload.error_code)
      : "";
  const error_message =
    typeof payload.error_message === "string" ? payload.error_message : "";
  if (!error_code && !error_message) return null;

  return {
    error_code,
    error_message,
    session_id:
      typeof payload.session_id === "string" ? payload.session_id : undefined,
  };
}

export function describeEmbeddedSignupError(
  err: EmbeddedSignupFlowError
): string {
  if (err.error_code === "1675030" || err.error_code === "1675012") {
    return "Facebook could not start WhatsApp signup (query failed). Close the popup, wait a minute, and try again. Use the reseller’s own Facebook — not the company/admin account — and create or pick a new business. Do not select a restricted or banned WhatsApp account.";
  }
  if (err.error_code === "1357053") {
    return "This Facebook or business is restricted from WhatsApp. Use a different Facebook account and a new business portfolio.";
  }
  if (err.error_message) return err.error_message;
  return "Facebook blocked WhatsApp signup. Try again, or use a different Facebook account.";
}

export function readEmbeddedSignupFromMessageEvent(
  event: MessageEvent
): EmbeddedSignupAssets | null {
  if (!isFacebookOrigin(event.origin)) return null;
  return parseEmbeddedSignupMessage(event.data);
}

export function readEmbeddedSignupErrorFromMessageEvent(
  event: MessageEvent
): EmbeddedSignupFlowError | null {
  if (!isFacebookOrigin(event.origin)) return null;
  return parseEmbeddedSignupError(event.data);
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
