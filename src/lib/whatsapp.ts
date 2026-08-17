import { decrypt } from "./crypto";
import { formatMoney } from "./currency";
import { normalizePhone } from "./phone";
import { resolveWhatsAppImagePayload } from "./whatsapp-image.server";

export { normalizePhone, toWhatsAppRecipient } from "./phone";

const GRAPH_API = "https://graph.facebook.com/v21.0";

export interface MetaAppCredentials {
  appId: string;
  appSecret: string;
}

export function resolveMetaSecret(
  encryptedOrPlain: string | null
): string | null {
  if (!encryptedOrPlain) return null;
  try {
    return decrypt(encryptedOrPlain);
  } catch {
    console.error(
      "Meta app secret decrypt failed — ENCRYPTION_KEY may differ from when secret was saved."
    );
    return null;
  }
}

export interface SendTemplateParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
}

export async function sendWhatsAppTemplate({
  phoneNumberId,
  accessToken,
  to,
  templateName,
  languageCode = "en",
  bodyParams = [],
}: SendTemplateParams): Promise<void> {
  const components =
    bodyParams.length > 0
      ? [
          {
            type: "body",
            parameters: bodyParams.map((text) => ({
              type: "text",
              text: text.trim() || "N/A",
            })),
          },
        ]
      : undefined;

  const res = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`WhatsApp template send failed: ${await res.text()}`);
  }
}

export async function sendWhatsAppText({
  phoneNumberId,
  accessToken,
  to,
  text,
}: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
}): Promise<void> {
  const res = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    let detail = raw;
    try {
      const parsed = JSON.parse(raw) as {
        error?: { message?: string; error_user_msg?: string; code?: number };
      };
      detail =
        parsed.error?.error_user_msg ||
        parsed.error?.message ||
        raw;
    } catch {
      // keep raw
    }
    throw new Error(detail);
  }
}

/** Send an image by public HTTPS URL (Cloud API link message). */
export async function sendWhatsAppImage({
  phoneNumberId,
  accessToken,
  to,
  imageUrl,
  caption,
}: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  imageUrl: string;
  caption?: string;
}): Promise<void> {
  const link = imageUrl.trim();
  if (!/^https:\/\//i.test(link)) {
    throw new Error("WhatsApp image URL must be a public https link");
  }

  const imagePayload = await resolveWhatsAppImagePayload({
    phoneNumberId,
    accessToken,
    imageUrl: link,
  });

  const res = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "image",
      image: {
        ...imagePayload,
        ...(caption?.trim() ? { caption: caption.trim().slice(0, 1024) } : {}),
      },
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    let detail = raw;
    try {
      const parsed = JSON.parse(raw) as {
        error?: { message?: string; error_user_msg?: string };
      };
      detail =
        parsed.error?.error_user_msg ||
        parsed.error?.message ||
        raw;
    } catch {
      // keep raw
    }
    throw new Error(detail);
  }
}

export async function getWhatsAppDisplayPhone(
  phoneNumberId: string,
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_API}/${phoneNumberId}?fields=display_phone_number`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      display_phone_number?: string;
    };
    return data.display_phone_number
      ? normalizePhone(data.display_phone_number)
      : null;
  } catch {
    return null;
  }
}

export async function exchangeEmbeddedSignupToken(
  code: string,
  creds: MetaAppCredentials
): Promise<{ access_token: string }> {
  const tokenRes = await fetch(
    `${GRAPH_API}/oauth/access_token?` +
      new URLSearchParams({
        client_id: creds.appId,
        client_secret: creds.appSecret,
        code,
      })
  );

  if (!tokenRes.ok) {
    const raw = await tokenRes.text();
    throw new Error(friendlyMetaError(raw, "Could not finish WhatsApp signup"));
  }

  return tokenRes.json() as Promise<{ access_token: string }>;
}

export async function subscribeWabaWebhooks(
  wabaId: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${GRAPH_API}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subscribed_fields: ["messages"],
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(
      friendlyMetaError(raw, "Could not subscribe WhatsApp webhooks")
    );
  }
}

/** Best-effort Cloud API phone registration after Embedded Signup. */
export async function registerWhatsAppPhoneNumber(
  phoneNumberId: string,
  accessToken: string,
  pin = "000000"
): Promise<void> {
  const res = await fetch(`${GRAPH_API}/${phoneNumberId}/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      pin,
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    // Already registered is fine
    if (/already registered|already been registered/i.test(raw)) return;
    console.warn("[whatsapp] phone register:", raw);
  }
}

export function friendlyMetaError(
  raw: string,
  fallback: string
): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("user cancelled") ||
    lower.includes("user canceled") ||
    lower.includes("access_denied")
  ) {
    return "Signup was cancelled. You can try Connect WhatsApp again anytime.";
  }
  if (
    lower.includes("already been added") ||
    lower.includes("phone number is already") ||
    lower.includes("already registered") ||
    lower.includes("(#100)")
  ) {
    return "This WhatsApp number is already connected to another app or business. Disconnect it there first, then try again.";
  }
  if (
    lower.includes("verification") ||
    lower.includes("not verified") ||
    lower.includes("otp")
  ) {
    return "Phone verification did not complete. Restart Connect WhatsApp and finish the SMS/code step.";
  }
  if (lower.includes("invalid oauth") || lower.includes("code has expired")) {
    return "The signup session expired. Please click Connect WhatsApp again.";
  }
  if (lower.includes("permissions") || lower.includes("insufficient")) {
    return "Meta did not grant the required WhatsApp permissions. Try again and approve all requested permissions.";
  }
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; error_user_msg?: string };
    };
    const msg =
      parsed.error?.error_user_msg || parsed.error?.message || "";
    if (msg && msg.length < 180 && !msg.includes("{")) {
      // Still sanitize raw Graph codes when possible
      if (/^\(#\d+\)/.test(msg) || msg.includes("OAuthException")) {
        return fallback;
      }
      return msg;
    }
  } catch {
    // ignore
  }
  return fallback;
}

export function getStoreMetaCredentials(store: {
  meta_app_id: string | null;
  meta_app_secret: string | null;
}): MetaAppCredentials | null {
  const appId = store.meta_app_id || process.env.META_APP_ID || null;
  const appSecret =
    resolveMetaSecret(store.meta_app_secret) ||
    process.env.META_APP_SECRET ||
    null;

  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

export function getStoreWhatsAppCredentials(store: {
  whatsapp_phone_number_id: string | null;
  whatsapp_access_token: string | null;
}): { phoneNumberId: string; accessToken: string } | null {
  // Fallback to env for testing before embedded signup
  const phoneNumberId =
    store.whatsapp_phone_number_id ||
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    null;
  const encryptedToken = store.whatsapp_access_token;

  let accessToken: string | null = null;
  if (encryptedToken) {
    try {
      accessToken = decrypt(encryptedToken);
    } catch {
      console.error(
        "WhatsApp token decrypt failed — ENCRYPTION_KEY may differ from when token was saved. Reconnect WhatsApp."
      );
      // Do not fall back to env if store has a token that won't decrypt —
      // that would send from the wrong number / wrong app.
      return null;
    }
  } else if (process.env.WHATSAPP_ACCESS_TOKEN) {
    accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  }

  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken };
}

export function formatOrderConfirmationParams(
  orderNumber: string,
  items: Array<{ title: string; quantity: number }>,
  total: number,
  currency?: string | null
): string[] {
  const itemsSummary = items
    .map((i) => `${i.quantity}x ${i.title}`)
    .join(", ");
  const totalLabel = currency
    ? formatMoney(total, currency)
    : total.toFixed(2);
  return [orderNumber, itemsSummary, totalLabel];
}
