import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import type { PlanId } from "@/lib/ai/plans";

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

export const PLAN_PRICES_AED: Record<PlanId, number> = {
  basic: 0,
  pro: 299,
  max: 799,
};

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

function safeDecrypt(value: string | null): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}

export async function getStorePayTabsCredentials(
  storeId: string
): Promise<PayTabsCredentialsPublic> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stores")
    .select(
      "paytabs_profile_id, paytabs_server_key, paytabs_client_key, paytabs_merchant_email, paytabs_region, paytabs_currency, paytabs_test_mode, paytabs_connected_at"
    )
    .eq("id", storeId)
    .single();

  if (error || !data) {
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
    };
  }

  const profileId = (data.paytabs_profile_id as string | null) ?? null;
  const hasServerKey = Boolean(data.paytabs_server_key);
  const connected = Boolean(profileId && hasServerKey);

  return {
    connected,
    profileId,
    clientKey: (data.paytabs_client_key as string | null) ?? null,
    merchantEmail: (data.paytabs_merchant_email as string | null) ?? null,
    region: ((data.paytabs_region as PayTabsRegion) || "ARE") as PayTabsRegion,
    currency: (data.paytabs_currency as string) || "AED",
    testMode: data.paytabs_test_mode !== false,
    connectedAt: (data.paytabs_connected_at as string | null) ?? null,
    hasServerKey,
  };
}

export async function updateStorePayTabsCredentials(
  storeId: string,
  input: PayTabsCredentialsInput
): Promise<PayTabsCredentialsPublic | { error: string }> {
  const profileId = input.profileId?.trim();
  if (!profileId) {
    return { error: "Profile ID is required" };
  }

  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from("stores")
    .select("paytabs_server_key")
    .eq("id", storeId)
    .single();

  if (!input.serverKey?.trim() && !current?.paytabs_server_key) {
    return { error: "Server Key is required for first-time setup" };
  }

  const region = input.region ?? "ARE";
  if (!PAYTABS_REGIONS.some((r) => r.id === region)) {
    return { error: "Invalid PayTabs region" };
  }

  const payload: Record<string, string | boolean | null> = {
    paytabs_profile_id: profileId,
    paytabs_client_key: input.clientKey?.trim() || null,
    paytabs_merchant_email: input.merchantEmail?.trim() || null,
    paytabs_region: region,
    paytabs_currency: (input.currency || "AED").trim().toUpperCase(),
    paytabs_test_mode: input.testMode !== false,
    paytabs_connected_at: new Date().toISOString(),
  };

  if (input.serverKey?.trim()) {
    payload.paytabs_server_key = encrypt(input.serverKey.trim());
  }

  const { error } = await supabase
    .from("stores")
    .update(payload)
    .eq("id", storeId);

  if (error) {
    const hint =
      error.message.includes("paytabs_profile_id") ||
      error.message.includes("column")
        ? " — Run migration 013_paytabs_and_platform_ai_defaults.sql in Supabase"
        : "";
    return { error: error.message + hint };
  }

  return getStorePayTabsCredentials(storeId);
}

export async function disconnectStorePayTabs(
  storeId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("stores")
    .update({
      paytabs_profile_id: null,
      paytabs_server_key: null,
      paytabs_client_key: null,
      paytabs_merchant_email: null,
      paytabs_connected_at: null,
      paytabs_test_mode: true,
    })
    .eq("id", storeId);

  if (error) return { error: error.message };
  return { ok: true };
}

/** Internal: decrypt server key for future API calls */
export async function getPayTabsServerKey(
  storeId: string
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("stores")
    .select("paytabs_server_key")
    .eq("id", storeId)
    .single();
  return safeDecrypt((data?.paytabs_server_key as string | null) ?? null);
}

/**
 * Stub checkout — creates a pending plan_payments row.
 * Real PayTabs hosted payment page will be wired later.
 */
export async function createPlanCheckoutStub(
  storeId: string,
  planId: PlanId
): Promise<
  | {
      status: "pending_api";
      message: string;
      paymentId: string;
      amount: number;
      currency: string;
      planId: PlanId;
    }
  | { error: string }
> {
  const creds = await getStorePayTabsCredentials(storeId);
  if (!creds.connected) {
    return {
      error:
        "Connect PayTabs first under Integrations → PayTabs before purchasing a plan.",
    };
  }

  if (planId === "basic") {
    return { error: "Basic plan is free — no payment required." };
  }

  const amount = PLAN_PRICES_AED[planId];
  const currency = creds.currency || "AED";
  const cartId = `plan_${planId}_${storeId.slice(0, 8)}_${Date.now()}`;

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
        note: "PayTabs API not connected yet — payment will be completed when API is wired.",
      },
    })
    .select("id")
    .single();

  if (error) {
    const hint = error.message.includes("plan_payments")
      ? " — Run migration 013_paytabs_and_platform_ai_defaults.sql in Supabase"
      : "";
    return { error: error.message + hint };
  }

  return {
    status: "pending_api",
    message:
      "Checkout request saved. PayTabs hosted payment will open here once the API is connected.",
    paymentId: data.id as string,
    amount,
    currency,
    planId,
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
