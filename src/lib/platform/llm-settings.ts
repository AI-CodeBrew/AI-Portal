import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";

export type AiLlmProvider = "groq" | "gemini";

export const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";

/** Map friendly admin names to valid Gemini API model ids. */
export function normalizeGeminiModel(model: string | null | undefined): string {
  const m = model?.trim() || DEFAULT_GEMINI_MODEL;
  if (m === "gemini-3-flash") return "gemini-3-flash-preview";
  return m;
}

export type PlatformLlmAdminView = {
  provider: AiLlmProvider;
  geminiModel: string;
  geminiApiKeyMasked: string | null;
  hasGeminiApiKey: boolean;
  /** Groq uses GROQ_API_KEY in server env — read-only indicator */
  groqConfigured: boolean;
  configured: boolean;
  updatedAt: string | null;
};

export type ActiveLlmConfig = {
  provider: AiLlmProvider;
  geminiApiKey: string | null;
  geminiModel: string;
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
      "[llm-settings] Failed to decrypt Gemini API key — check ENCRYPTION_KEY matches the environment where the key was saved:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

function isProvider(value: unknown): value is AiLlmProvider {
  return value === "groq" || value === "gemini";
}

function resolveGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

function resolveGeminiKeyFromEnv(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key || null;
}

export async function getActiveLlmConfig(): Promise<ActiveLlmConfig> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("ai_llm_provider, gemini_api_key, gemini_model")
    .eq("id", 1)
    .maybeSingle();

  const provider = isProvider(data?.ai_llm_provider)
    ? data.ai_llm_provider
    : "groq";
  const geminiModel = normalizeGeminiModel(data?.gemini_model as string | null);

  let geminiApiKey: string | null = null;
  if (data?.gemini_api_key) {
    geminiApiKey = safeDecrypt(data.gemini_api_key as string);
  }
  if (!geminiApiKey) {
    geminiApiKey = resolveGeminiKeyFromEnv();
  }

  return { provider, geminiApiKey, geminiModel };
}

export async function getPlatformLlmAdminView(): Promise<PlatformLlmAdminView> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select(
      "ai_llm_provider, gemini_api_key, gemini_model, updated_at"
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    const hint = error.message.includes("platform_settings")
      ? " — Run migration 029_platform_llm_settings.sql in Supabase"
      : "";
    throw new Error(error.message + hint);
  }

  const provider = isProvider(data?.ai_llm_provider)
    ? data.ai_llm_provider
    : "groq";
  const geminiModel = normalizeGeminiModel(data?.gemini_model as string | null);
  const encryptedKey = (data?.gemini_api_key as string | null) ?? null;
  const plainKey =
    safeDecrypt(encryptedKey) ?? resolveGeminiKeyFromEnv();
  const hasGeminiApiKey = Boolean(encryptedKey || resolveGeminiKeyFromEnv());
  const groqConfigured = resolveGroqConfigured();
  const configured =
    provider === "groq"
      ? groqConfigured
      : hasGeminiApiKey;

  return {
    provider,
    geminiModel,
    geminiApiKeyMasked: maskSecret(plainKey),
    hasGeminiApiKey,
    groqConfigured,
    configured,
    updatedAt: (data?.updated_at as string | null) ?? null,
  };
}

export async function updatePlatformLlmSettings(input: {
  provider?: AiLlmProvider;
  geminiApiKey?: string;
  geminiModel?: string;
  updatedBy?: string | null;
}): Promise<PlatformLlmAdminView | { error: string }> {
  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from("platform_settings")
    .select("gemini_api_key, ai_llm_provider, gemini_model")
    .eq("id", 1)
    .maybeSingle();

  const provider =
    input.provider ??
    (isProvider(current?.ai_llm_provider) ? current.ai_llm_provider : "groq");

  if (provider === "gemini") {
    const keyInput = input.geminiApiKey?.trim();
    const hasExisting = Boolean(
      current?.gemini_api_key || resolveGeminiKeyFromEnv()
    );
    if (!keyInput && !hasExisting) {
      return {
        error:
          "Gemini API key is required when Gemini is selected (paste key or set GEMINI_API_KEY env).",
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

  const keyInput = input.geminiApiKey?.trim();
  if (keyInput) {
    payload.gemini_api_key = encrypt(keyInput);
  }

  const { error } = await supabase
    .from("platform_settings")
    .upsert({ id: 1, ...payload }, { onConflict: "id" });

  if (error) {
    const hint = error.message.includes("ai_llm_provider")
      ? " — Run migration 029_platform_llm_settings.sql in Supabase"
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
    return resolveGroqConfigured();
  }
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
