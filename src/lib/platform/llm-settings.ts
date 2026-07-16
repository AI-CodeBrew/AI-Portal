import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";

export type AiLlmProvider = "groq" | "gemini";

export const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";
export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

/** Map friendly admin names to valid Gemini API model ids. */
export function normalizeGeminiModel(model: string | null | undefined): string {
  const m = model?.trim() || DEFAULT_GEMINI_MODEL;
  if (m === "gemini-3-flash") return "gemini-3-flash-preview";
  return m;
}

export function normalizeGroqModel(model: string | null | undefined): string {
  return model?.trim() || DEFAULT_GROQ_MODEL;
}

export type PlatformLlmAdminView = {
  provider: AiLlmProvider;
  geminiModel: string;
  groqModel: string;
  geminiApiKeyMasked: string | null;
  groqApiKeyMasked: string | null;
  hasGeminiApiKey: boolean;
  hasGroqApiKey: boolean;
  /** True when Groq key comes from server env (not DB) */
  groqFromEnv: boolean;
  /** True when Gemini key comes from server env (not DB) */
  geminiFromEnv: boolean;
  configured: boolean;
  updatedAt: string | null;
};

export type ActiveLlmConfig = {
  provider: AiLlmProvider;
  geminiApiKey: string | null;
  geminiModel: string;
  groqApiKey: string | null;
  groqModel: string;
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

function isProvider(value: unknown): value is AiLlmProvider {
  return value === "groq" || value === "gemini";
}

function resolveGroqKeyFromEnv(): string | null {
  const key = process.env.GROQ_API_KEY?.trim();
  return key || null;
}

function resolveGeminiKeyFromEnv(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key || null;
}

function resolveGroqModelFromEnv(): string | null {
  const model = process.env.GROQ_MODEL?.trim();
  return model || null;
}

export async function getActiveLlmConfig(): Promise<ActiveLlmConfig> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("platform_settings")
    .select(
      "ai_llm_provider, gemini_api_key, gemini_model, groq_api_key, groq_model"
    )
    .eq("id", 1)
    .maybeSingle();

  const provider = isProvider(data?.ai_llm_provider)
    ? data.ai_llm_provider
    : "groq";
  const geminiModel = normalizeGeminiModel(data?.gemini_model as string | null);
  const groqModel =
    normalizeGroqModel(data?.groq_model as string | null) ||
    normalizeGroqModel(resolveGroqModelFromEnv());

  let geminiApiKey: string | null = null;
  if (data?.gemini_api_key) {
    geminiApiKey = safeDecrypt(data.gemini_api_key as string);
  }
  if (!geminiApiKey) {
    geminiApiKey = resolveGeminiKeyFromEnv();
  }

  let groqApiKey: string | null = null;
  if (data?.groq_api_key) {
    groqApiKey = safeDecrypt(data.groq_api_key as string);
  }
  if (!groqApiKey) {
    groqApiKey = resolveGroqKeyFromEnv();
  }

  return { provider, geminiApiKey, geminiModel, groqApiKey, groqModel };
}

export async function getPlatformLlmAdminView(): Promise<PlatformLlmAdminView> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select(
      "ai_llm_provider, gemini_api_key, gemini_model, groq_api_key, groq_model, updated_at"
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    const hint = error.message.includes("platform_settings")
      ? " — Run migrations 029 and 032 in Supabase"
      : "";
    throw new Error(error.message + hint);
  }

  const provider = isProvider(data?.ai_llm_provider)
    ? data.ai_llm_provider
    : "groq";
  const geminiModel = normalizeGeminiModel(data?.gemini_model as string | null);
  const groqModel = normalizeGroqModel(data?.groq_model as string | null);

  const geminiEncrypted = (data?.gemini_api_key as string | null) ?? null;
  const groqEncrypted = (data?.groq_api_key as string | null) ?? null;

  const geminiFromEnv = Boolean(!geminiEncrypted && resolveGeminiKeyFromEnv());
  const groqFromEnv = Boolean(!groqEncrypted && resolveGroqKeyFromEnv());

  const geminiPlain =
    safeDecrypt(geminiEncrypted) ?? resolveGeminiKeyFromEnv();
  const groqPlain = safeDecrypt(groqEncrypted) ?? resolveGroqKeyFromEnv();

  const hasGeminiApiKey = Boolean(geminiEncrypted || resolveGeminiKeyFromEnv());
  const hasGroqApiKey = Boolean(groqEncrypted || resolveGroqKeyFromEnv());

  const configured =
    provider === "groq" ? hasGroqApiKey : hasGeminiApiKey;

  return {
    provider,
    geminiModel,
    groqModel,
    geminiApiKeyMasked: maskSecret(geminiPlain),
    groqApiKeyMasked: maskSecret(groqPlain),
    hasGeminiApiKey,
    hasGroqApiKey,
    groqFromEnv,
    geminiFromEnv,
    configured,
    updatedAt: (data?.updated_at as string | null) ?? null,
  };
}

export async function updatePlatformLlmSettings(input: {
  provider?: AiLlmProvider;
  geminiApiKey?: string;
  geminiModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  clearGeminiApiKey?: boolean;
  clearGroqApiKey?: boolean;
  updatedBy?: string | null;
}): Promise<PlatformLlmAdminView | { error: string }> {
  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from("platform_settings")
    .select(
      "gemini_api_key, groq_api_key, ai_llm_provider, gemini_model, groq_model"
    )
    .eq("id", 1)
    .maybeSingle();

  const provider =
    input.provider ??
    (isProvider(current?.ai_llm_provider) ? current.ai_llm_provider : "groq");

  const hasGeminiStored = Boolean(
    current?.gemini_api_key || resolveGeminiKeyFromEnv()
  );
  const hasGroqStored = Boolean(
    current?.groq_api_key || resolveGroqKeyFromEnv()
  );

  if (provider === "gemini") {
    const keyInput = input.geminiApiKey?.trim();
    if (input.clearGeminiApiKey) {
      // allowed — may fall back to env or force re-entry
    } else if (!keyInput && !hasGeminiStored) {
      return {
        error:
          "Gemini API key is required when Gemini is selected (paste key or set GEMINI_API_KEY env).",
      };
    }
  }

  if (provider === "groq") {
    const keyInput = input.groqApiKey?.trim();
    if (input.clearGroqApiKey) {
      // allowed
    } else if (!keyInput && !hasGroqStored) {
      return {
        error:
          "Groq API key is required when Groq is selected (paste key or set GROQ_API_KEY env).",
      };
    }
  }

  const payload: Record<string, string | null> = {
    ai_llm_provider: provider,
    updated_at: new Date().toISOString(),
    updated_by: input.updatedBy ?? null,
  };

  if (input.geminiModel !== undefined) {
    payload.gemini_model =
      normalizeGeminiModel(input.geminiModel.trim() || DEFAULT_GEMINI_MODEL);
  } else if (!current?.gemini_model) {
    payload.gemini_model = DEFAULT_GEMINI_MODEL;
  }

  if (input.groqModel !== undefined) {
    payload.groq_model =
      normalizeGroqModel(input.groqModel.trim() || DEFAULT_GROQ_MODEL);
  } else if (!current?.groq_model) {
    payload.groq_model = DEFAULT_GROQ_MODEL;
  }

  const geminiKeyInput = input.geminiApiKey?.trim();
  if (geminiKeyInput) {
    payload.gemini_api_key = encrypt(geminiKeyInput);
  } else if (input.clearGeminiApiKey) {
    payload.gemini_api_key = null;
  }

  const groqKeyInput = input.groqApiKey?.trim();
  if (groqKeyInput) {
    payload.groq_api_key = encrypt(groqKeyInput);
  } else if (input.clearGroqApiKey) {
    payload.groq_api_key = null;
  }

  const { error } = await supabase
    .from("platform_settings")
    .upsert({ id: 1, ...payload }, { onConflict: "id" });

  if (error) {
    const hint =
      error.message.includes("groq_api_key") ||
      error.message.includes("ai_llm_provider")
        ? " — Run migrations 029 and 032 in Supabase"
        : "";
    return { error: error.message + hint };
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
  if (config.provider === "gemini") {
    return Boolean(config.geminiApiKey);
  }
  if (config.provider === "groq") {
    return Boolean(config.groqApiKey);
  }
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
