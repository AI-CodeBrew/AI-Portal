import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";

export const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";
/** Gemini model for JSON intent routing (tried before main agent on ambiguous turns). */
export const DEFAULT_GEMINI_INTENT_MODEL = "gemini-3.5-flash";

export type GeminiModelChoice = {
  id: string;
  label: string;
  description: string;
};

/** Presets shown in Admin → AI Defaults model picker. */
export const GEMINI_SALES_MODEL_CHOICES: GeminiModelChoice[] = [
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash (recommended)",
    description: "Best for tool calling and ambiguous WhatsApp sales chat.",
  },
  {
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    description: "Fast default — strong balance of speed and quality.",
  },
  {
    id: "gemini-3-flash",
    label: "Gemini 3 Flash",
    description: "Alias for 3 Flash Preview in the API.",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Lower cost; good for high message volume.",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "Deeper reasoning — slower and higher cost.",
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro Preview",
    description: "Maximum quality for difficult conversations.",
  },
];

export const GEMINI_INTENT_MODEL_CHOICES: GeminiModelChoice[] = [
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash (recommended)",
    description: "Best for classifying intent before handlers run.",
  },
  {
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    description: "Faster intent routing.",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Budget intent routing.",
  },
];

export function normalizeGeminiIntentModel(
  model: string | null | undefined
): string {
  const m = model?.trim() || DEFAULT_GEMINI_INTENT_MODEL;
  if (m === "gemini-3-flash") return "gemini-3-flash-preview";
  return m;
}

/** Map friendly admin names to valid Gemini API model ids. */
export function normalizeGeminiModel(model: string | null | undefined): string {
  const m = model?.trim() || DEFAULT_GEMINI_MODEL;
  if (m === "gemini-3-flash") return "gemini-3-flash-preview";
  return m;
}

export type PlatformLlmAdminView = {
  geminiModel: string;
  geminiIntentModel: string;
  geminiApiKeyMasked: string | null;
  hasGeminiApiKey: boolean;
  /** True when Gemini key comes from server env (not DB) */
  geminiFromEnv: boolean;
  configured: boolean;
  updatedAt: string | null;
};

export type ActiveLlmConfig = {
  geminiApiKey: string | null;
  geminiModel: string;
  geminiIntentModel: string;
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
  } catch (err) {
    console.error(
      "[llm-settings] Failed to decrypt API key — check ENCRYPTION_KEY matches the environment where the key was saved:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

function resolveGeminiKeyFromEnv(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key || null;
}

export async function getActiveLlmConfig(): Promise<ActiveLlmConfig> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("gemini_api_key, gemini_model, gemini_intent_model")
    .eq("id", 1)
    .maybeSingle();

  const geminiModel = normalizeGeminiModel(data?.gemini_model as string | null);
  const geminiIntentModel = normalizeGeminiIntentModel(
    data?.gemini_intent_model as string | null
  );

  let geminiApiKey: string | null = null;
  if (data?.gemini_api_key) {
    geminiApiKey = safeDecrypt(data.gemini_api_key as string);
  }
  if (!geminiApiKey) {
    geminiApiKey = resolveGeminiKeyFromEnv();
  }

  return { geminiApiKey, geminiModel, geminiIntentModel };
}

export async function getPlatformLlmAdminView(): Promise<PlatformLlmAdminView> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("gemini_api_key, gemini_model, gemini_intent_model, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    const hint = error.message.includes("platform_settings")
      ? " — Run migrations 029+ in Supabase"
      : "";
    throw new Error(error.message + hint);
  }

  const geminiModel = normalizeGeminiModel(data?.gemini_model as string | null);
  const geminiIntentModel = normalizeGeminiIntentModel(
    data?.gemini_intent_model as string | null
  );
  const geminiEncrypted = (data?.gemini_api_key as string | null) ?? null;
  const geminiFromEnv = Boolean(!geminiEncrypted && resolveGeminiKeyFromEnv());
  const geminiPlain =
    safeDecrypt(geminiEncrypted) ?? resolveGeminiKeyFromEnv();
  const hasGeminiApiKey = Boolean(geminiEncrypted || resolveGeminiKeyFromEnv());

  return {
    geminiModel,
    geminiIntentModel,
    geminiApiKeyMasked: maskSecret(geminiPlain),
    hasGeminiApiKey,
    geminiFromEnv,
    configured: hasGeminiApiKey,
    updatedAt: (data?.updated_at as string | null) ?? null,
  };
}

export async function updatePlatformLlmSettings(input: {
  geminiApiKey?: string;
  geminiModel?: string;
  geminiIntentModel?: string;
  clearGeminiApiKey?: boolean;
  updatedBy?: string | null;
}): Promise<PlatformLlmAdminView | { error: string }> {
  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from("platform_settings")
    .select("gemini_api_key, gemini_model, gemini_intent_model")
    .eq("id", 1)
    .maybeSingle();

  const hasGeminiStored = Boolean(
    current?.gemini_api_key || resolveGeminiKeyFromEnv()
  );

  const keyInput = input.geminiApiKey?.trim();
  if (input.clearGeminiApiKey) {
    // allowed — may fall back to env or force re-entry
  } else if (!keyInput && !hasGeminiStored) {
    return {
      error:
        "Gemini API key is required (paste key in admin or set GEMINI_API_KEY env).",
    };
  }

  const payload: Record<string, string | null> = {
    ai_llm_provider: "gemini",
    updated_at: new Date().toISOString(),
    updated_by: input.updatedBy ?? null,
  };

  if (input.geminiModel !== undefined) {
    payload.gemini_model =
      normalizeGeminiModel(input.geminiModel.trim() || DEFAULT_GEMINI_MODEL);
  } else if (!current?.gemini_model) {
    payload.gemini_model = DEFAULT_GEMINI_MODEL;
  }

  if (input.geminiIntentModel !== undefined) {
    payload.gemini_intent_model = normalizeGeminiIntentModel(
      input.geminiIntentModel.trim() || DEFAULT_GEMINI_INTENT_MODEL
    );
  } else if (!current?.gemini_intent_model) {
    payload.gemini_intent_model = DEFAULT_GEMINI_INTENT_MODEL;
  }

  if (keyInput) {
    payload.gemini_api_key = encrypt(keyInput);
  } else if (input.clearGeminiApiKey) {
    payload.gemini_api_key = null;
  }

  const { error } = await supabase
    .from("platform_settings")
    .upsert({ id: 1, ...payload }, { onConflict: "id" });

  if (error) {
    return { error: error.message };
  }

  try {
    return await getPlatformLlmAdminView();
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Saved but failed to reload",
    };
  }
}

export async function isLlmProviderConfigured(): Promise<boolean> {
  const config = await getActiveLlmConfig();
  return Boolean(config.geminiApiKey);
}
