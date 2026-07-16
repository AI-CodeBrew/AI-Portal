import {
  OPENAI_SALES_TOOLS,
  executeSalesTool,
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

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

const PRODUCT_QUERY_PATTERN =
  /\b(price|cost|how much|do you have|available|in stock|product|buy|sell|show me|looking for|details|about|sku|want this|variant|variants|size|sizes|color|colors|colour|option|options)\b/i;

const ORDER_QUERY_PATTERN =
  /\b(order|tracking|delivery|shipped|where is my|my order|order status|dispatch)\b/i;

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

type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | {
      role: "tool";
      tool_call_id: string;
      name: string;
      content: string;
    };

interface GroqResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
}

async function groqChat(
  messages: ChatMessage[],
  opts?: { forceSearchProducts?: boolean; apiKey: string; model: string }
): Promise<GroqResponse> {
  const apiKey = opts?.apiKey;
  if (!apiKey) {
    throw new Error("Groq API key is not configured");
  }

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts?.model || DEFAULT_MODEL,
      messages,
      tools: OPENAI_SALES_TOOLS,
      tool_choice: opts?.forceSearchProducts
        ? { type: "function", function: { name: "search_products" } }
        : "auto",
      max_tokens: 1024,
      temperature: 0.35,
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq API error: ${await res.text()}`);
  }

  return res.json() as Promise<GroqResponse>;
}

export async function runSalesAgentWithGroq(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  options: { apiKey: string; model?: string }
): Promise<string> {
  const storeLabel = ctx.store.store_name || ctx.store.shop_domain || "our store";
  const latestUser = lastUserMessage(history);
  const historyLimit =
    ctx.aiConfig?.effectiveChatHistoryLimit ?? CHAT_HISTORY_LIMIT;
  const trimmedHistory = history.slice(-historyLimit);

  const skuHint = extractSkuFromText(latestUser);
  const nameHint = extractProductSearchQuery(latestUser);
  const searchHint = skuHint || nameHint;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSalesSystemPrompt({
        storeLabel,
        storeCurrency: ctx.storeCurrency,
        aiConfig: ctx.aiConfig,
        adProductContext: ctx.adProductContext,
        pendingOrdersHint: ctx.pendingOrdersHint,
        history: trimmedHistory,
      }),
    },
    ...trimmedHistory.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

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

  const groqModel = options.model?.trim() || DEFAULT_MODEL;

  for (let i = 0; i < maxIterations; i++) {
    const response = await groqChat(messages, {
      forceSearchProducts: forceSearch && i === 0,
      apiKey: options.apiKey,
      model: groqModel,
    });
    const choice = response.choices[0];
    if (!choice) break;

    const assistantMessage = choice.message;

    if (
      choice.finish_reason === "stop" ||
      (!assistantMessage.tool_calls?.length && assistantMessage.content)
    ) {
      const text =
        assistantMessage.content?.trim() ||
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

    if (assistantMessage.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls,
      });

      for (const toolCall of assistantMessage.tool_calls) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(toolCall.function.arguments || "{}") as Record<
            string,
            unknown
          >;
        } catch {
          input = {};
        }

        if (
          toolCall.function.name === "search_products" &&
          searchHint &&
          (!input.query ||
            String(input.query).includes("\n") ||
            String(input.query).length > 80)
        ) {
          input = { ...input, query: searchHint };
        }

        const { result, escalated } = await executeSalesTool(
          toolCall.function.name,
          input,
          ctx
        );

        if (escalated) {
          return "Got it — someone from our team will message you shortly 👍";
        }

        if (toolCall.function.name === "search_products") {
          usedSearchProducts = true;
          const products =
            result && typeof result === "object" && "products" in result
              ? (result as { products?: typeof lastSearchProducts }).products
              : [];
          if (Array.isArray(products)) lastSearchProducts = products;
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(result),
        });
      }

      continue;
    }

    break;
  }

  if (lastSearchProducts.length > 0) {
    return formatProductsReply(lastSearchProducts);
  }

  return "Sorry, I'm having a bit of trouble — a team member will jump in shortly.";
}
