/**
 * Gemini LLM config — API key + models come from env only.
 * Admin UI is read-only (connected status + model names).
 */

export const DEFAULT_GEMINI_CHAT_MODEL = "gemini-3.6-flash";
export const DEFAULT_GEMINI_REASONING_MODEL = "gemini-3.1-pro-preview";
export const DEFAULT_GEMINI_UTILITY_MODEL = "gemini-3.1-flash-lite";

/** @deprecated use DEFAULT_GEMINI_CHAT_MODEL */
export const DEFAULT_GEMINI_MODEL = DEFAULT_GEMINI_CHAT_MODEL;
/** @deprecated use DEFAULT_GEMINI_UTILITY_MODEL */
export const DEFAULT_GEMINI_INTENT_MODEL = DEFAULT_GEMINI_UTILITY_MODEL;

export type GeminiModelChoice = {
  id: string;
  label: string;
  description: string;
};

/** Kept for any leftover imports; admin no longer uses pickers. */
export const GEMINI_SALES_MODEL_CHOICES: GeminiModelChoice[] = [
  {
    id: DEFAULT_GEMINI_CHAT_MODEL,
    label: "Chat (env)",
    description: "GEMINI_CHAT_MODEL",
  },
];

export const GEMINI_INTENT_MODEL_CHOICES: GeminiModelChoice[] = [
  {
    id: DEFAULT_GEMINI_UTILITY_MODEL,
    label: "Utility (env)",
    description: "GEMINI_UTILITY_MODEL",
  },
];

function envModel(name: string, fallback: string): string {
  const m = process.env[name]?.trim();
  if (!m) return fallback;
  if (m === "gemini-3-flash") return "gemini-3-flash-preview";
  return m;
}

export function resolveGeminiChatModel(): string {
  return envModel("GEMINI_CHAT_MODEL", DEFAULT_GEMINI_CHAT_MODEL);
}

export function resolveGeminiReasoningModel(): string {
  return envModel("GEMINI_REASONING_MODEL", DEFAULT_GEMINI_REASONING_MODEL);
}

export function resolveGeminiUtilityModel(): string {
  return envModel("GEMINI_UTILITY_MODEL", DEFAULT_GEMINI_UTILITY_MODEL);
}

export function normalizeGeminiIntentModel(
  model: string | null | undefined
): string {
  const m = model?.trim() || resolveGeminiUtilityModel();
  if (m === "gemini-3-flash") return "gemini-3-flash-preview";
  return m;
}

/** Map friendly names to valid Gemini API model ids. */
export function normalizeGeminiModel(model: string | null | undefined): string {
  const m = model?.trim() || resolveGeminiChatModel();
  if (m === "gemini-3-flash") return "gemini-3-flash-preview";
  return m;
}

export type PlatformLlmAdminView = {
  geminiModel: string;
  geminiIntentModel: string;
  geminiChatModel: string;
  geminiReasoningModel: string;
  geminiUtilityModel: string;
  geminiApiKeyMasked: string | null;
  hasGeminiApiKey: boolean;
  /** Always true when key comes from env (admin cannot save keys). */
  geminiFromEnv: boolean;
  configured: boolean;
  updatedAt: string | null;
};

export type ActiveLlmConfig = {
  geminiApiKey: string | null;
  /** Sales / chat replies — GEMINI_CHAT_MODEL */
  geminiModel: string;
  /** Intent / light tasks — GEMINI_UTILITY_MODEL until wiring is finalized */
  geminiIntentModel: string;
  geminiChatModel: string;
  geminiReasoningModel: string;
  geminiUtilityModel: string;
};

function maskSecret(plain: string | null): string | null {
  if (!plain) return null;
  if (plain.length <= 4) return "••••";
  return `••••••${plain.slice(-4)}`;
}

function resolveGeminiKeyFromEnv(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key || null;
}

export async function getActiveLlmConfig(): Promise<ActiveLlmConfig> {
  const geminiChatModel = resolveGeminiChatModel();
  const geminiReasoningModel = resolveGeminiReasoningModel();
  const geminiUtilityModel = resolveGeminiUtilityModel();

  return {
    geminiApiKey: resolveGeminiKeyFromEnv(),
    geminiModel: geminiChatModel,
    geminiIntentModel: geminiUtilityModel,
    geminiChatModel,
    geminiReasoningModel,
    geminiUtilityModel,
  };
}

export async function getPlatformLlmAdminView(): Promise<PlatformLlmAdminView> {
  const geminiApiKey = resolveGeminiKeyFromEnv();
  const geminiChatModel = resolveGeminiChatModel();
  const geminiReasoningModel = resolveGeminiReasoningModel();
  const geminiUtilityModel = resolveGeminiUtilityModel();
  const hasGeminiApiKey = Boolean(geminiApiKey);

  return {
    geminiModel: geminiChatModel,
    geminiIntentModel: geminiUtilityModel,
    geminiChatModel,
    geminiReasoningModel,
    geminiUtilityModel,
    geminiApiKeyMasked: maskSecret(geminiApiKey),
    hasGeminiApiKey,
    geminiFromEnv: hasGeminiApiKey,
    configured: hasGeminiApiKey,
    updatedAt: null,
  };
}

/** Admin can no longer change API key or models — env is source of truth. */
export async function updatePlatformLlmSettings(_input: {
  geminiApiKey?: string;
  geminiModel?: string;
  geminiIntentModel?: string;
  clearGeminiApiKey?: boolean;
  updatedBy?: string | null;
}): Promise<PlatformLlmAdminView | { error: string }> {
  return {
    error:
      "Gemini API key and models are configured via environment variables (GEMINI_API_KEY, GEMINI_CHAT_MODEL, GEMINI_REASONING_MODEL, GEMINI_UTILITY_MODEL). They cannot be changed in the admin UI.",
  };
}

export async function isLlmProviderConfigured(): Promise<boolean> {
  const config = await getActiveLlmConfig();
  return Boolean(config.geminiApiKey);
}
