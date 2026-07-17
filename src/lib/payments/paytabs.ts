import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import {
  AI_PLANS,
  PLAN_PRICES_AED,
  planAllowsSelfCheckout,
  type PlanId,
} from "@/lib/ai/plans";
import { getAppUrl } from "@/lib/app-url";

export { PLAN_PRICES_AED };

export type PayTabsRegion = "ARE" | "SAU" | "EGY" | "OMN" | "JOR" | "GLOBAL";

export const PAYTABS_REGIONS: Array<{
  id: PayTabsRegion;
  label: string;
  apiHost: string;
}> = [
  { id: "ARE", label: "UAE (ARE)", apiHost: "https://secure.paytabs.com" },
  { id: "SAU", label: "Saudi Arabia (SAU)", apiHost: "https://secure.paytabs.sa" },
  { id: "EGY", label: "Egypt (EGY)", apiHost: "https://secure-egypt.paytabs.com" },
  { id: "OMN", label: "Oman (OMN)", apiHost: "https://secure-oman.paytabs.com" },
  { id: "JOR", label: "Jordan (JOR)", apiHost: "https://secure-jordan.paytabs.com" },
  { id: "GLOBAL", label: "Global", apiHost: "https://secure-global.paytabs.com" },
];

export interface PayTabsCredentialsPublic {
  connected: boolean;
  profileId: string | null;
  clientKey: string | null;
  merchantEmail: string | null;
  region: PayTabsRegion;
  currency: string;
  testMode: boolean;
  connectedAt: string | null;
  hasServerKey: boolean;
  updatedAt: string | null;
}

export interface PayTabsCredentialsInput {
  profileId: string;
  serverKey?: string;
  clientKey?: string | null;
  merchantEmail?: string | null;
  region?: PayTabsRegion;
  currency?: string;
  testMode?: boolean;
}

export interface PlanPaymentRow {
  id: string;
  store_id: string;
  plan_id: string;
  amount: number;
  currency: string;
  status: string;
  paytabs_tran_ref: string | null;
  paytabs_cart_id: string | null;
  created_at: string;
  stores?:
    | { store_name: string | null; shop_domain: string | null }
    | { store_name: string | null; shop_domain: string | null }[]
    | null;
}

function safeDecrypt(value: string | null): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}

function emptyCredentials(): PayTabsCredentialsPublic {
  return {
    connected: false,
    profileId: null,
    clientKey: null,
    merchantEmail: null,
    region: "ARE",
    currency: "AED",
    testMode: true,
    connectedAt: null,
    hasServerKey: false,
    updatedAt: null,
  };
}

export function getPayTabsApiHost(region: PayTabsRegion): string {
  return (
    PAYTABS_REGIONS.find((r) => r.id === region)?.apiHost ??
    "https://secure.paytabs.com"
  );
}

/** Platform PayTabs credentials (admin-configured). */
export async function getPlatformPayTabsCredentials(): Promise<PayTabsCredentialsPublic> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("platform_paytabs_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return emptyCredentials();
  }

  const profileId = (data.profile_id as string | null) ?? null;
  const hasServerKey = Boolean(data.server_key);
  const connected = Boolean(profileId && hasServerKey);

  return {
    connected,
    profileId,
    clientKey: (data.client_key as string | null) ?? null,
    merchantEmail: (data.merchant_email as string | null) ?? null,
    region: ((data.region as PayTabsRegion) || "ARE") as PayTabsRegion,
    currency: (data.currency as string) || "AED",
    testMode: data.test_mode !== false,
    connectedAt: (data.connected_at as string | null) ?? null,
    hasServerKey,
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}

export async function updatePlatformPayTabsCredentials(
  input: PayTabsCredentialsInput
): Promise<PayTabsCredentialsPublic | { error: string }> {
  const profileId = input.profileId?.trim();
  if (!profileId) {
    return { error: "Profile ID is required" };
  }

  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from("platform_paytabs_settings")
    .select("server_key")
    .eq("id", 1)
    .maybeSingle();

  if (!input.serverKey?.trim() && !current?.server_key) {
    return { error: "Server Key is required for first-time setup" };
  }

  const region = input.region ?? "ARE";
  if (!PAYTABS_REGIONS.some((r) => r.id === region)) {
    return { error: "Invalid PayTabs region" };
  }

  const payload: Record<string, string | boolean | number | null> = {
    id: 1,
    profile_id: profileId,
    client_key: input.clientKey?.trim() || null,
    merchant_email: input.merchantEmail?.trim() || null,
    region,
    currency: (input.currency || "AED").trim().toUpperCase(),
    test_mode: input.testMode !== false,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (input.serverKey?.trim()) {
    payload.server_key = encrypt(input.serverKey.trim());
  }

  const { error } = await supabase
    .from("platform_paytabs_settings")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    const hint =
      error.message.includes("platform_paytabs_settings") ||
      error.message.includes("relation")
        ? " — Run migration 014_platform_paytabs.sql in Supabase"
        : "";
    return { error: error.message + hint };
  }

  return getPlatformPayTabsCredentials();
}

export async function disconnectPlatformPayTabs(): Promise<
  { ok: true } | { error: string }
> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("platform_paytabs_settings")
    .upsert(
      {
        id: 1,
        profile_id: null,
        server_key: null,
        client_key: null,
        merchant_email: null,
        connected_at: null,
        test_mode: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) return { error: error.message };
  return { ok: true };
}

/** Decrypt platform server key for future PayTabs API calls */
export async function getPlatformPayTabsServerKey(): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("platform_paytabs_settings")
    .select("server_key")
    .eq("id", 1)
    .maybeSingle();
  return safeDecrypt((data?.server_key as string | null) ?? null);
}

/**
 * Reseller selects a plan → create pending payment + return checkout URL stub.
 * When PayTabs API is wired, this will call /payment/request and return redirect_url.
 */
export async function createPlanCheckout(
  storeId: string,
  planId: PlanId
): Promise<
  | {
      status: "pending_api" | "ready";
      message: string;
      paymentId: string;
      amount: number;
      currency: string;
      planId: PlanId;
      planName: string;
      /** PayTabs hosted page URL — null until API is connected */
      checkoutUrl: string | null;
      returnUrl: string;
      callbackUrl: string;
    }
  | { error: string }
> {
  const creds = await getPlatformPayTabsCredentials();
  if (!creds.connected) {
    return {
      error:
        "Billing is not available yet. The platform admin must connect PayTabs first.",
    };
  }

  if (planId === "basic") {
    return { error: "Basic plan is free — no payment required." };
  }

  if (!planAllowsSelfCheckout(planId)) {
    return {
      error:
        "Enterprise is customized — contact the platform admin to upgrade your plan.",
    };
  }

  const amount = PLAN_PRICES_AED[planId];
  const currency = creds.currency || "AED";
  const cartId = `plan_${planId}_${storeId.slice(0, 8)}_${Date.now()}`;
  const appUrl = getAppUrl();
  const returnUrl = `${appUrl}/dashboard/plan?payment=return`;
  const callbackUrl = `${appUrl}/api/billing/paytabs/callback`;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("plan_payments")
    .insert({
      store_id: storeId,
      plan_id: planId,
      amount,
      currency,
      status: "pending",
      paytabs_cart_id: cartId,
      metadata: {
        stub: true,
        region: creds.region,
        testMode: creds.testMode,
        returnUrl,
        callbackUrl,
        note: "Awaiting PayTabs hosted payment API. Wire payment/request next.",
      },
    })
    .select("id")
    .single();

  if (error) {
    const hint = error.message.includes("plan_payments")
      ? " — Run migration 014_platform_paytabs.sql in Supabase"
      : "";
    return { error: error.message + hint };
  }

  // TODO: Call PayTabs payment/request with profile_id + server_key and set checkoutUrl
  // const serverKey = await getPlatformPayTabsServerKey();
  // const host = getPayTabsApiHost(creds.region);
  // POST {host}/payment/request → redirect_url

  return {
    status: "pending_api",
    message:
      "Checkout created. PayTabs hosted page will open here once the payment API is connected by the platform.",
    paymentId: data.id as string,
    amount,
    currency,
    planId,
    planName: AI_PLANS[planId].name,
    checkoutUrl: null,
    returnUrl,
    callbackUrl,
  };
}

export async function listStorePlanPayments(storeId: string, limit = 10) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("plan_payments")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}

export async function listAllPlanPayments(limit = 50): Promise<PlanPaymentRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("plan_payments")
    .select(
      "id, store_id, plan_id, amount, currency, status, paytabs_tran_ref, paytabs_cart_id, created_at, stores(store_name, shop_domain)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as PlanPaymentRow[];
}

/** Public status for reseller plan page (no secrets). */
export async function getBillingAvailability(): Promise<{
  available: boolean;
  currency: string;
  prices: Record<PlanId, number>;
}> {
  const creds = await getPlatformPayTabsCredentials();
  return {
    available: creds.connected,
    currency: creds.currency || "AED",
    prices: PLAN_PRICES_AED,
  };
}
