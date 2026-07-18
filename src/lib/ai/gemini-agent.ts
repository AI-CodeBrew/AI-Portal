import {
  executeSalesTool,
  geminiFunctionDeclarations,
  type AgentContext,
} from "./sales-tools";
import { CHAT_HISTORY_LIMIT } from "./chat-history";
import { buildSalesSystemPromptWithExamples } from "./build-system-prompt-with-examples";
import { formatProductsReply } from "./product-reply";
import {
  extractSkuFromText,
  extractProductSearchQuery,
} from "@/lib/products/products-service";
import { pickInitialCatalogTool } from "./shopping-intent";
import {
  DEFAULT_GEMINI_MODEL,
  normalizeGeminiModel,
} from "@/lib/platform/llm-settings";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

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

function toolFormattedReply(result: unknown): string | null {
  if (result && typeof result === "object" && "formatted_reply" in result) {
    const text = (result as { formatted_reply?: string }).formatted_reply?.trim();
    return text || null;
  }
  return null;
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

function mergeGeminiContents(contents: GeminiContent[]): GeminiContent[] {
  if (!contents.length) return contents;
  const merged: GeminiContent[] = [];
  for (const item of contents) {
    const text = item.parts
      .filter((p): p is { text: string } => "text" in p)
      .map((p) => p.text)
      .join("\n");
    const last = merged[merged.length - 1];
    if (last && last.role === item.role && text) {
      const lastText = last.parts
        .filter((p): p is { text: string } => "text" in p)
        .map((p) => p.text)
        .join("\n");
      last.parts = [{ text: `${lastText}\n${text}`.trim() }];
      continue;
    }
    merged.push(item);
  }
  return merged;
}

async function geminiGenerate(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  contents: GeminiContent[];
  forceToolName?: string;
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

  if (params.forceToolName) {
    body.toolConfig = {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: [params.forceToolName],
      },
    };
  } else {
    body.toolConfig = {
      functionCallingConfig: { mode: "AUTO" },
    };
  }

  const res = await fetch(
    `${GEMINI_API_BASE}/${encodeURIComponent(params.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": params.apiKey,
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(
      `[gemini-agent] API error model=${params.model} status=${res.status}:`,
      errText.slice(0, 500)
    );
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`);
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
  const model = normalizeGeminiModel(options.model);
  const agentCtx: AgentContext = { ...ctx, chatHistory: trimmedHistory };

  const skuHint = extractSkuFromText(latestUser);
  const nameHint = extractProductSearchQuery(latestUser);
  const searchHint = skuHint || nameHint;
  const initialTool = pickInitialCatalogTool(latestUser, trimmedHistory);

  const systemPrompt = await buildSalesSystemPromptWithExamples({
    storeId: ctx.store.id,
    storeLabel,
    storeCurrency: ctx.storeCurrency,
    aiConfig: ctx.aiConfig,
    adProductContext: ctx.adProductContext,
    pendingOrdersHint: ctx.pendingOrdersHint,
    history: trimmedHistory,
  });

  const contents = mergeGeminiContents(toGeminiContents(trimmedHistory));
  const maxIterations = 8;
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
      forceToolName: i === 0 ? (initialTool ?? undefined) : undefined,
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

      const { result, escalated } = await executeSalesTool(name, input, agentCtx);

      if (escalated) {
        return "Got it — someone from our team will message you shortly 👍";
      }

      const formatted = toolFormattedReply(result);
      if (name === "browse_catalog" && formatted) {
        return formatted;
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
