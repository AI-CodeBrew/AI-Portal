import {
  executeSalesTool,
  geminiFunctionDeclarations,
  type AgentContext,
} from "./sales-tools";
import { CHAT_HISTORY_LIMIT } from "./chat-history";
import { buildSalesSystemPrompt } from "./build-system-prompt";
import { formatProductsReply } from "./product-reply";
import {
  extractSkuFromText,
  extractProductSearchQuery,
} from "@/lib/products/products-service";
import { looksLikeCasualGreeting } from "./greeting-reply";
import { DEFAULT_GEMINI_MODEL } from "@/lib/platform/llm-settings";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const PRODUCT_QUERY_PATTERN =
  /\b(price|cost|how much|do you have|available|in stock|product|buy|sell|show me|looking for|details|about|sku|want this|variant|variants|size|sizes|color|colors|colour|option|options)\b/i;

const ORDER_QUERY_PATTERN =
  /\b(order|tracking|delivery|shipped|where is my|my order|order status|dispatch)\b/i;

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

interface GeminiResponse {
  candidates?: Array<{
    content?: { role?: string; parts?: GeminiPart[] };
    finishReason?: string;
  }>;
}

function lastUserMessage(
  history: Array<{ role: "user" | "assistant"; content: string }>
): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].content;
  }
  return "";
}

function looksLikeProductQuery(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (looksLikeCasualGreeting(t)) return false;
  if (ORDER_QUERY_PATTERN.test(t)) return false;
  if (extractSkuFromText(t)) return true;
  if (PRODUCT_QUERY_PATTERN.test(t)) return true;
  if (/^[A-Z0-9][A-Z0-9_-]{3,47}$/i.test(t)) return true;
  return t.length <= 80 && !/^(hi|hello|hey|thanks|thank you|ok|yes|no)\b/i.test(t);
}

function looksLikeOrderQuery(text: string): boolean {
  const t = text.trim();
  if (/\bplace\s+(an\s+)?order\b/i.test(t)) return false;
  return ORDER_QUERY_PATTERN.test(t);
}

function toGeminiContents(
  history: Array<{ role: "user" | "assistant"; content: string }>
): GeminiContent[] {
  return history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

function toolResultObject(result: unknown): Record<string, unknown> {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return { result: result ?? null };
}

async function geminiGenerate(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  contents: GeminiContent[];
  forceSearchProducts?: boolean;
}): Promise<GeminiResponse> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: params.systemPrompt }] },
    contents: params.contents,
    tools: [{ functionDeclarations: geminiFunctionDeclarations() }],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 1024,
    },
  };

  if (params.forceSearchProducts) {
    body.toolConfig = {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: ["search_products"],
      },
    };
  } else {
    body.toolConfig = {
      functionCallingConfig: { mode: "AUTO" },
    };
  }

  const res = await fetch(
    `${GEMINI_API_BASE}/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini API error: ${await res.text()}`);
  }

  return res.json() as Promise<GeminiResponse>;
}

export async function runSalesAgentWithGemini(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  options: { apiKey: string; model?: string }
): Promise<string> {
  const storeLabel = ctx.store.store_name || ctx.store.shop_domain || "our store";
  const latestUser = lastUserMessage(history);
  const historyLimit =
    ctx.aiConfig?.effectiveChatHistoryLimit ?? CHAT_HISTORY_LIMIT;
  const trimmedHistory = history.slice(-historyLimit);
  const model = options.model?.trim() || DEFAULT_GEMINI_MODEL;

  const skuHint = extractSkuFromText(latestUser);
  const nameHint = extractProductSearchQuery(latestUser);
  const searchHint = skuHint || nameHint;

  const systemPrompt = buildSalesSystemPrompt({
    storeLabel,
    storeCurrency: ctx.storeCurrency,
    aiConfig: ctx.aiConfig,
    adProductContext: ctx.adProductContext,
    pendingOrdersHint: ctx.pendingOrdersHint,
    history: trimmedHistory,
  });

  const contents = toGeminiContents(trimmedHistory);
  const maxIterations = 8;
  const forceSearch =
    looksLikeProductQuery(latestUser) && !looksLikeOrderQuery(latestUser);
  let usedSearchProducts = false;
  let lastSearchProducts: Array<{
    title?: string;
    sku?: string;
    description?: string | null;
    imageUrl?: string | null;
    image_url?: string | null;
    image_urls?: string[] | null;
    variants?: Array<{
      title?: string;
      price_formatted?: string;
      in_stock?: boolean;
    }>;
  }> = [];

  for (let i = 0; i < maxIterations; i++) {
    const response = await geminiGenerate({
      apiKey: options.apiKey,
      model,
      systemPrompt,
      contents,
      forceSearchProducts: forceSearch && i === 0,
    });

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    if (!parts.length) break;

    const functionCalls = parts.filter(
      (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
        "functionCall" in p && Boolean(p.functionCall?.name)
    );
    const textParts = parts
      .filter((p): p is { text: string } => "text" in p && Boolean(p.text?.trim()))
      .map((p) => p.text.trim());

    if (!functionCalls.length) {
      const text =
        textParts.join("\n").trim() ||
        "Hey 👋 What product can I help you with?";

      if (
        usedSearchProducts &&
        lastSearchProducts.length > 0 &&
        !/price|rs\.?|pkr|€|\$|aed|in stock|available|\d/i.test(text)
      ) {
        return formatProductsReply(lastSearchProducts);
      }

      return text;
    }

    contents.push({
      role: "model",
      parts: functionCalls.map((p) => ({ functionCall: p.functionCall })),
    });

    const responseParts: GeminiPart[] = [];

    for (const call of functionCalls) {
      const name = call.functionCall.name;
      let input = { ...(call.functionCall.args ?? {}) };

      if (
        name === "search_products" &&
        searchHint &&
        (!input.query ||
          String(input.query).includes("\n") ||
          String(input.query).length > 80)
      ) {
        input = { ...input, query: searchHint };
      }

      const { result, escalated } = await executeSalesTool(name, input, ctx);

      if (escalated) {
        return "Got it — someone from our team will message you shortly 👍";
      }

      if (name === "search_products") {
        usedSearchProducts = true;
        const products =
          result && typeof result === "object" && "products" in result
            ? (result as { products?: typeof lastSearchProducts }).products
            : [];
        if (Array.isArray(products)) lastSearchProducts = products;
      }

      responseParts.push({
        functionResponse: {
          name,
          response: toolResultObject(result),
        },
      });
    }

    contents.push({ role: "user", parts: responseParts });
  }

  if (lastSearchProducts.length > 0) {
    return formatProductsReply(lastSearchProducts);
  }

  return "Sorry, I'm having a bit of trouble — a team member will jump in shortly.";
}
