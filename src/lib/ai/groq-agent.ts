import {
  OPENAI_SALES_TOOLS,
  executeSalesTool,
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

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

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
  opts?: {
    forceToolName?: string;
    apiKey: string;
    model: string;
  }
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
      tool_choice: opts?.forceToolName
        ? { type: "function", function: { name: opts.forceToolName } }
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

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    ...trimmedHistory.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

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

  const groqModel = options.model?.trim() || DEFAULT_MODEL;

  for (let i = 0; i < maxIterations; i++) {
    const response = await groqChat(messages, {
      forceToolName: i === 0 ? (initialTool ?? undefined) : undefined,
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
          agentCtx
        );

        if (escalated) {
          return "Got it — someone from our team will message you shortly 👍";
        }

        const formatted = toolFormattedReply(result);
        if (toolCall.function.name === "browse_catalog" && formatted) {
          return formatted;
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
