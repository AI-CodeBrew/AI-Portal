import { decrypt } from "./crypto";
import { formatMoney } from "./currency";

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
              text,
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
    throw new Error(`WhatsApp text send failed: ${await res.text()}`);
  }
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
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
    throw new Error(`Meta token exchange failed: ${await tokenRes.text()}`);
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
    throw new Error(`WABA subscription failed: ${await res.text()}`);
  }
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
      accessToken = null;
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
