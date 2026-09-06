import { decrypt } from "./crypto";
import { formatMoney } from "./currency";
import { normalizePhone } from "./phone";
import { GRAPH_API } from "./whatsapp/graph";
import { resolveWhatsAppImagePayload } from "./whatsapp-image.server";

export { normalizePhone, toWhatsAppRecipient } from "./phone";
export { GRAPH_API, WHATSAPP_GRAPH_API_VERSION } from "./whatsapp/graph";

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

export interface SendResult {
  /** Meta's wamid for this message, used to match delivery-status webhooks back to it. */
  id: string | null;
}

async function parseSendResult(res: Response): Promise<SendResult> {
  try {
    const data = (await res.json()) as { messages?: Array<{ id: string }> };
    return { id: data.messages?.[0]?.id ?? null };
  } catch {
    return { id: null };
  }
}

export async function sendWhatsAppTemplate({
  phoneNumberId,
  accessToken,
  to,
  templateName,
  languageCode = "en",
  bodyParams = [],
}: SendTemplateParams): Promise<SendResult> {
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

  return parseSendResult(res);
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
}): Promise<SendResult> {
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

  return parseSendResult(res);
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
}): Promise<SendResult> {
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

  return parseSendResult(res);
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

  const shortLived = (await tokenRes.json()) as { access_token?: string };
  if (!shortLived.access_token) {
    throw new Error("Could not finish WhatsApp signup");
  }

  const longLived = await exchangeForLongLivedToken(
    shortLived.access_token,
    creds
  );
  return { access_token: longLived ?? shortLived.access_token };
}

/** Best-effort: short-lived ES tokens become 60-day tokens. Already-long-lived tokens stay as-is. */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  creds: MetaAppCredentials
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_API}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: creds.appId,
          client_secret: creds.appSecret,
          fb_exchange_token: shortLivedToken,
        })
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token || null;
  } catch {
    return null;
  }
}

export async function resolveWhatsAppAssetsFromToken(
  accessToken: string,
  creds: MetaAppCredentials,
  hints?: { waba_id?: string; phone_number_id?: string }
): Promise<{ waba_id: string | null; phone_number_id: string | null }> {
  let wabaId = hints?.waba_id?.trim() || null;
  let phoneNumberId = hints?.phone_number_id?.trim() || null;

  if (!wabaId) {
    wabaId = await resolveWabaIdFromDebugToken(accessToken, creds);
  }

  if (wabaId && !phoneNumberId) {
    phoneNumberId = await resolvePhoneIdForWaba(wabaId, accessToken);
  }

  return { waba_id: wabaId, phone_number_id: phoneNumberId };
}

async function resolveWabaIdFromDebugToken(
  accessToken: string,
  creds: MetaAppCredentials
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_API}/debug_token?` +
        new URLSearchParams({
          input_token: accessToken,
          access_token: `${creds.appId}|${creds.appSecret}`,
        })
    );
    if (!res.ok) return null;

    const payload = (await res.json()) as {
      data?: {
        granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
      };
    };
    const scopes = payload.data?.granular_scopes ?? [];
    const preferred =
      scopes.find((s) => s.scope === "whatsapp_business_management")
        ?.target_ids ??
      scopes.find((s) => s.scope === "whatsapp_business_messaging")
        ?.target_ids ??
      [];
    return preferred[preferred.length - 1] ?? preferred[0] ?? null;
  } catch {
    return null;
  }
}

async function resolvePhoneIdForWaba(
  wabaId: string,
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_API}/${wabaId}/phone_numbers?fields=id,display_phone_number`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as { data?: Array<{ id?: string }> };
    const phones = payload.data ?? [];
    return phones[phones.length - 1]?.id ?? phones[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function subscribeWabaWebhooks(
  wabaId: string,
  accessToken: string
): Promise<void> {
  const attempts: Array<Record<string, unknown> | undefined> = [
    {
      subscribed_fields: [
        "messages",
        "account_update",
        "message_template_status_update",
      ],
    },
    { subscribed_fields: ["messages"] },
    undefined,
  ];

  let lastRaw = "";
  for (const body of attempts) {
    const res = await fetch(`${GRAPH_API}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.ok) return;
    lastRaw = await res.text();
  }

  throw new Error(
    friendlyMetaError(lastRaw, "Could not subscribe WhatsApp webhooks")
  );
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
  const phoneNumberId = store.whatsapp_phone_number_id || null;
  const encryptedToken = store.whatsapp_access_token;
  if (!phoneNumberId || !encryptedToken) return null;

  try {
    const accessToken = decrypt(encryptedToken);
    if (!accessToken) return null;
    return { phoneNumberId, accessToken };
  } catch {
    console.error(
      "WhatsApp token decrypt failed — ENCRYPTION_KEY may differ from when token was saved. Reconnect WhatsApp."
    );
    return null;
  }
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
