import {
  OPENAI_SALES_TOOLS,
  executeSalesTool,
  type AgentContext,
} from "./sales-tools";
import { CHAT_HISTORY_LIMIT } from "./chat-history";
import { buildSalesSystemPrompt } from "./build-system-prompt";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

const PRODUCT_QUERY_PATTERN =
  /\b(price|cost|how much|do you have|available|in stock|product|buy|sell|show me|looking for|details|about)\b/i;

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
  if (PRODUCT_QUERY_PATTERN.test(t)) return true;
  // Short messages that are likely a product name (e.g. "Classic T-Shirt")
  return t.length <= 80 && !/^(hi|hello|hey|thanks|thank you|ok|yes|no)\b/i.test(t);
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

async function groqChat(messages: ChatMessage[]): Promise<GroqResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
      messages,
      tools: OPENAI_SALES_TOOLS,
      tool_choice: "auto",
      max_tokens: 1024,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq API error: ${await res.text()}`);
  }

  return res.json() as Promise<GroqResponse>;
}

export async function runSalesAgentWithGroq(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const storeLabel = ctx.store.store_name || ctx.store.shop_domain || "our store";
  const latestUser = lastUserMessage(history);
  const productHint = ctx.adProductContext
    ? `\n\nThe customer clicked an ad for "${ctx.adProductContext.productTitle}". Use the ad product context below — do not ask what product they want unless they change topic.`
    : looksLikeProductQuery(latestUser)
      ? `\n\nThe customer's latest message appears to be about a product ("${latestUser.slice(0, 120)}"). You MUST call search_products with a relevant keyword before replying.`
      : "";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSalesSystemPrompt({
        storeLabel,
        storeCurrency: ctx.storeCurrency,
        productHint,
        aiConfig: ctx.aiConfig,
        adProductContext: ctx.adProductContext,
      }),
    },
    ...history.slice(-CHAT_HISTORY_LIMIT).map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const maxIterations = 8;

  for (let i = 0; i < maxIterations; i++) {
    const response = await groqChat(messages);
    const choice = response.choices[0];
    if (!choice) break;

    const assistantMessage = choice.message;

    if (
      choice.finish_reason === "stop" ||
      (!assistantMessage.tool_calls?.length && assistantMessage.content)
    ) {
      return (
        assistantMessage.content?.trim() ||
        "Thanks for your message! How can I help you today?"
      );
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

        const { result, escalated } = await executeSalesTool(
          toolCall.function.name,
          input,
          ctx
        );

        if (escalated) {
          return "I've connected you with our team. A human agent will be with you shortly. Thank you for your patience!";
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

  return "I'm having trouble processing your request. Let me get a team member to help you.";
}
