import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/crypto";

export type PlatformMetaPublic = {
  metaAppId: string | null;
  metaConfigId: string | null;
  configured: boolean;
};

export type PlatformMetaAdminView = {
  metaAppId: string | null;
  metaConfigId: string | null;
  /** Masked secret e.g. ••••••1234 — never the full value */
  metaAppSecretMasked: string | null;
  hasMetaAppSecret: boolean;
  whatsappVerifyToken: string | null;
  configured: boolean;
  updatedAt: string | null;
};

function maskSecret(plain: string | null): string | null {
  if (!plain) return null;
  if (plain.length <= 4) return "••••";
  return `••••••${plain.slice(-4)}`;
}

function safeDecrypt(value: string | null): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    // May already be plain (legacy) — do not return raw if looks encrypted blob length
    return null;
  }
}

export async function getPlatformMetaPublic(): Promise<PlatformMetaPublic> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("meta_app_id, meta_embedded_signup_config_id, meta_app_secret")
    .eq("id", 1)
    .maybeSingle();

  if (error && !error.message.includes("platform_settings")) {
    console.error("[platform-settings] public read:", error.message);
  }

  const metaAppId =
    (data?.meta_app_id as string | null) ||
    process.env.META_APP_ID ||
    process.env.NEXT_PUBLIC_META_APP_ID ||
    null;
  const metaConfigId =
    (data?.meta_embedded_signup_config_id as string | null) ||
    process.env.META_CONFIG_ID ||
    process.env.NEXT_PUBLIC_META_CONFIG_ID ||
    null;
  const hasSecret = Boolean(
    data?.meta_app_secret || process.env.META_APP_SECRET
  );
  const configured = Boolean(metaAppId && metaConfigId && hasSecret);

  return { metaAppId, metaConfigId, configured };
}

export async function getPlatformMetaAdminView(): Promise<PlatformMetaAdminView> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    const hint = error.message.includes("platform_settings")
      ? " — Run migration 023_platform_settings.sql in Supabase"
      : "";
    throw new Error(error.message + hint);
  }

  const metaAppId = (data?.meta_app_id as string | null) ?? null;
  const metaConfigId =
    (data?.meta_embedded_signup_config_id as string | null) ?? null;
  const encryptedSecret = (data?.meta_app_secret as string | null) ?? null;
  const plainSecret = safeDecrypt(encryptedSecret);
  const hasMetaAppSecret = Boolean(encryptedSecret);
  const configured = Boolean(metaAppId && metaConfigId && hasMetaAppSecret);

  return {
    metaAppId,
    metaConfigId,
    metaAppSecretMasked: maskSecret(plainSecret),
    hasMetaAppSecret,
    whatsappVerifyToken:
      (data?.whatsapp_verify_token as string | null) ?? null,
    configured,
    updatedAt: (data?.updated_at as string | null) ?? null,
  };
}

/** Server-only: decrypted Meta app credentials for token exchange / webhook verify. */
export async function getPlatformMetaCredentials(): Promise<{
  appId: string;
  appSecret: string;
  configId: string | null;
  verifyToken: string | null;
} | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("platform_settings")
    .select(
      "meta_app_id, meta_app_secret, meta_embedded_signup_config_id, whatsapp_verify_token"
    )
    .eq("id", 1)
    .maybeSingle();

  if (!data?.meta_app_id || !data?.meta_app_secret) {
    // Env fallback for local/dev before admin saves
    const envId = process.env.META_APP_ID ?? null;
    const envSecret = process.env.META_APP_SECRET ?? null;
    if (envId && envSecret) {
      return {
        appId: envId,
        appSecret: envSecret,
        configId:
          process.env.META_CONFIG_ID ??
          process.env.NEXT_PUBLIC_META_CONFIG_ID ??
          null,
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? null,
      };
    }
    return null;
  }

  const appSecret = safeDecrypt(data.meta_app_secret as string);
  if (!appSecret) return null;

  return {
    appId: data.meta_app_id as string,
    appSecret,
    configId:
      (data.meta_embedded_signup_config_id as string | null) ?? null,
    verifyToken: (data.whatsapp_verify_token as string | null) ?? null,
  };
}

export async function updatePlatformMetaSettings(input: {
  metaAppId: string;
  metaAppSecret?: string;
  metaConfigId: string;
  updatedBy?: string | null;
}): Promise<PlatformMetaAdminView | { error: string }> {
  const metaAppId = input.metaAppId.trim();
  const metaConfigId = input.metaConfigId.trim();

  if (!metaAppId) {
    return { error: "Meta App ID is required" };
  }
  if (!metaConfigId) {
    return { error: "Embedded Signup Configuration ID is required" };
  }

  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from("platform_settings")
    .select("meta_app_secret, whatsapp_verify_token")
    .eq("id", 1)
    .maybeSingle();

  const secretInput = input.metaAppSecret?.trim();
  if (!secretInput && !current?.meta_app_secret) {
    return { error: "Meta App Secret is required for first-time setup" };
  }

  const verifyToken =
    (current?.whatsapp_verify_token as string | null)?.trim() ||
    randomBytes(24).toString("hex");

  const payload: Record<string, string | null> = {
    meta_app_id: metaAppId,
    meta_embedded_signup_config_id: metaConfigId,
    whatsapp_verify_token: verifyToken,
    updated_at: new Date().toISOString(),
    updated_by: input.updatedBy ?? null,
  };

  if (secretInput) {
    payload.meta_app_secret = encrypt(secretInput);
  }

  const { error } = await supabase
    .from("platform_settings")
    .upsert({ id: 1, ...payload }, { onConflict: "id" });

  if (error) {
    const hint = error.message.includes("platform_settings")
      ? " — Run migration 023_platform_settings.sql in Supabase"
      : "";
    return { error: error.message + hint };
  }

  try {
    return await getPlatformMetaAdminView();
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Saved but failed to reload",
    };
  }
}

/** Clear platform Meta credentials so admin can reconnect with a new app. */
export async function clearPlatformMetaSettings(updatedBy?: string | null): Promise<
  PlatformMetaAdminView | { error: string }
> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("platform_settings")
    .upsert(
      {
        id: 1,
        meta_app_id: null,
        meta_app_secret: null,
        meta_embedded_signup_config_id: null,
        whatsapp_verify_token: null,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy ?? null,
      },
      { onConflict: "id" }
    );

  if (error) {
    const hint = error.message.includes("platform_settings")
      ? " — Run migration 023_platform_settings.sql in Supabase"
      : "";
    return { error: error.message + hint };
  }

  try {
    return await getPlatformMetaAdminView();
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Cleared but failed to reload",
    };
  }
}

export type ResellerWhatsAppStatus =
  | "connected"
  | "not_connected"
  | "pending";

export type AdminWhatsAppMonitorRow = {
  storeId: string;
  storeName: string | null;
  shopDomain: string | null;
  ownerEmail: string | null;
  status: ResellerWhatsAppStatus;
  phoneNumberId: string | null;
  displayPhone: string | null;
  wabaId: string | null;
};

export async function listResellerWhatsAppStatus(): Promise<
  AdminWhatsAppMonitorRow[]
> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stores")
    .select(
      "id, store_name, shop_domain, owner_email, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token, whatsapp_display_phone"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[platform-settings] monitor list:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const hasPhone = Boolean(row.whatsapp_phone_number_id);
    const hasToken = Boolean(row.whatsapp_access_token);
    let status: ResellerWhatsAppStatus = "not_connected";
    if (hasPhone && hasToken) status = "connected";
    else if (hasPhone || hasToken) status = "pending";

    return {
      storeId: row.id as string,
      storeName: (row.store_name as string | null) ?? null,
      shopDomain: (row.shop_domain as string | null) ?? null,
      ownerEmail: (row.owner_email as string | null) ?? null,
      status,
      phoneNumberId: (row.whatsapp_phone_number_id as string | null) ?? null,
      displayPhone: (row.whatsapp_display_phone as string | null) ?? null,
      wabaId: (row.whatsapp_waba_id as string | null) ?? null,
    };
  });
}
