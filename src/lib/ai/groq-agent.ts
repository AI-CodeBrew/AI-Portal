import {
  OPENAI_SALES_TOOLS,
  executeSalesTool,
  type AgentContext,
} from "./sales-tools";
import { CHAT_HISTORY_LIMIT } from "./chat-history";
import { buildSalesSystemPrompt } from "./build-system-prompt";
import {
  formatProductsReply,
  tryDirectProductReply,
} from "./product-reply";
import { tryDirectCheckoutReply, looksLikeCheckoutMessage } from "./checkout-reply";
import { tryDirectSalesRecoveryReply, looksLikeOrderDecline } from "./sales-recovery";
import {
  extractSkuFromText,
  extractProductSearchQuery,
} from "@/lib/products/products-service";

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
  if (ORDER_QUERY_PATTERN.test(t)) return false;
  if (extractSkuFromText(t)) return true;
  if (PRODUCT_QUERY_PATTERN.test(t)) return true;
  if (/^[A-Z0-9][A-Z0-9_-]{3,47}$/i.test(t)) return true;
  return t.length <= 80 && !/^(hi|hello|hey|thanks|thank you|ok|yes|no)\b/i.test(t);
}

function looksLikeOrderQuery(text: string): boolean {
  const t = text.trim();
  if (looksLikeCheckoutMessage(t)) return false;
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
  opts?: { forceSearchProducts?: boolean }
): Promise<GroqResponse> {
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
      tool_choice: opts?.forceSearchProducts
        ? { type: "function", function: { name: "search_products" } }
        : "auto",
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

  // Place order with contact details → confirm before LLM
  const checkoutReply = await tryDirectCheckoutReply(ctx, latestUser, history);
  if (checkoutReply) {
    return checkoutReply;
  }

  const recoveryReply = await tryDirectSalesRecoveryReply(
    ctx,
    latestUser,
    history
  );
  if (recoveryReply) {
    return recoveryReply;
  }

  // SKU or product name → answer from catalog first (don't rely on the model)
  const directProduct = await tryDirectProductReply(ctx, latestUser);
  if (directProduct) {
    return directProduct.reply;
  }

  const skuHint = extractSkuFromText(latestUser);
  const nameHint = extractProductSearchQuery(latestUser);
  const searchHint = skuHint || nameHint;
  const productHint = ctx.adProductContext
    ? `\n\nThe customer clicked an ad for "${ctx.adProductContext.productTitle}". Use the ad product context below — do not ask what product they want unless they change topic.`
    : looksLikeCheckoutMessage(latestUser)
      ? `\n\nThe customer wants to PLACE AN ORDER and shared details. You MUST call create_draft_order with their name, phone, address, and the product/sku from this chat (portal SKU or variant id from search_products). Do not only say thanks.`
      : looksLikeOrderDecline(latestUser)
        ? `\n\nThe customer declined ordering. Recover the sale ONE step at a time: if you have not offered 15% yet, offer 15% off the discussed product with the discounted price; if you already offered 15% and they declined again, offer a 2-pack bundle (~25% off); if both were refused, thank them and stop. Do not dump both offers at once.`
      : looksLikeOrderQuery(latestUser)
      ? `\n\nThe customer is asking about their order ("${latestUser.slice(0, 120).replace(/\n/g, " ")}"). You MUST call lookup_customer_orders (or get_order_status if they gave an order number) and share clear order details.`
      : looksLikeProductQuery(latestUser)
        ? `\n\nThe customer's latest message appears to be about a product ("${latestUser.slice(0, 120).replace(/\n/g, " ")}"${searchHint ? `; search query: ${searchHint}` : ""}). You MUST call search_products first${searchHint ? ` with query "${searchHint}"` : ""}, share full details (name, price_formatted, stock, description, options, and all variants), then ask if they want to buy and collect name, phone, and address to close the sale.`
        : history.length === 0
          ? `\n\nNo messages in the current 2-hour AI session — greet briefly as a fresh chat, then help with products or orders.`
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
        pendingOrdersHint: ctx.pendingOrdersHint,
      }),
    },
    ...history
      .slice(
        -(ctx.aiConfig?.effectiveChatHistoryLimit ?? CHAT_HISTORY_LIMIT)
      )
      .map((m) => ({
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
    variants?: Array<{
      title?: string;
      price_formatted?: string;
      in_stock?: boolean;
    }>;
  }> = [];

  for (let i = 0; i < maxIterations; i++) {
    const response = await groqChat(messages, {
      forceSearchProducts: forceSearch && i === 0,
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
        "Thanks for your message! How can I help you today?";

      // Model greeted without product details after we forced a search — use catalog data
      if (
        usedSearchProducts &&
        lastSearchProducts.length > 0 &&
        !/sku|price|rs\.?|pkr|\$|in stock|available/i.test(text)
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

        // Prefer extracted SKU/name when the model searches with the full free-text message
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
          return "I've connected you with our team. A human agent will be with you shortly. Thank you for your patience!";
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

  return "I'm having trouble processing your request. Let me get a team member to help you.";
}
