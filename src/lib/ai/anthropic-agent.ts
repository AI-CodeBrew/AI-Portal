import Anthropic from "@anthropic-ai/sdk";
import { executeSalesTool, type AgentContext } from "./sales-tools";
import { buildSalesSystemPrompt } from "./build-system-prompt";
import { CHAT_HISTORY_LIMIT } from "./chat-history";
import { tryDirectProductReply } from "./product-reply";
import { tryDirectCheckoutReply } from "./checkout-reply";
import { tryDirectSalesRecoveryReply } from "./sales-recovery";
import {
  extractSkuFromText,
  extractProductSearchQuery,
} from "@/lib/products/products-service";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANTHROPIC_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_products",
    description:
      "Search BOTH portal catalog and Shopify by name, keyword, or SKU. Always use for product questions. If the customer pasted a SKU (e.g. AA-…), pass that SKU as query.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Product name, keyword, or SKU/ref",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "check_stock",
    description: "Check real-time stock and price for a product variant",
    input_schema: {
      type: "object" as const,
      properties: {
        variant_id: { type: "string", description: "Shopify variant ID" },
      },
      required: ["variant_id"],
    },
  },
  {
    name: "create_draft_order",
    description:
      "Create and confirm an order (portal catalog or Shopify). Requires name + phone + address. For portal products pass sku and/or UUID variant_id/product_id from search_products. For Shopify pass numeric variant_id.",
    input_schema: {
      type: "object" as const,
      properties: {
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              variant_id: { type: "string" },
              product_id: { type: "string" },
              sku: { type: "string" },
              source: { type: "string" },
              quantity: { type: "number" },
            },
            required: ["quantity"],
          },
        },
        customer_name: { type: "string" },
        phone: {
          type: "string",
          description: "Phone to receive confirmation (number customer shared)",
        },
        address1: { type: "string" },
        address2: { type: "string" },
        city: { type: "string" },
        province: { type: "string" },
        country: { type: "string" },
        zip: { type: "string" },
        discount_percent: { type: "number" },
      },
      required: ["line_items", "customer_name", "address1", "city", "phone"],
    },
  },
  {
    name: "confirm_order",
    description:
      "Confirm a pending portal/Shopify order after the customer agrees",
    input_schema: {
      type: "object" as const,
      properties: {
        order_number: { type: "string" },
      },
      required: ["order_number"],
    },
  },
  {
    name: "cancel_order",
    description: "Cancel a pending order when the customer declines",
    input_schema: {
      type: "object" as const,
      properties: {
        order_number: { type: "string" },
        reason: { type: "string" },
      },
      required: ["order_number"],
    },
  },
  {
    name: "lookup_customer_orders",
    description:
      "List this customer's recent orders by WhatsApp phone. Use when they ask about their order/status/tracking.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_order_status",
    description:
      "Look up one order by order number (portal and/or Shopify)",
    input_schema: {
      type: "object" as const,
      properties: {
        order_number: { type: "string" },
      },
      required: ["order_number"],
    },
  },
  {
    name: "escalate_to_human",
    description: "Flag conversation for human agent handoff",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: { type: "string" },
      },
      required: ["reason"],
    },
  },
];

export async function runSalesAgentWithAnthropic(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const storeLabel = ctx.store.store_name || ctx.store.shop_domain || "our store";
  const latestUser =
    [...history].reverse().find((m) => m.role === "user")?.content ?? "";

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

  const directProduct = await tryDirectProductReply(ctx, latestUser);
  if (directProduct) {
    return directProduct.reply;
  }

  const historyLimit =
    ctx.aiConfig?.effectiveChatHistoryLimit ?? CHAT_HISTORY_LIMIT;
  const trimmedHistory = history.slice(-historyLimit);

  const skuHint = extractSkuFromText(latestUser);
  const searchHint = skuHint || extractProductSearchQuery(latestUser);

  const messages: Anthropic.MessageParam[] = trimmedHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: buildSalesSystemPrompt({
        storeLabel,
        storeCurrency: ctx.storeCurrency,
        aiConfig: ctx.aiConfig,
        adProductContext: ctx.adProductContext,
        pendingOrdersHint: ctx.pendingOrdersHint,
        history: trimmedHistory,
      }),
      cache_control: { type: "ephemeral" },
    },
  ];

  const toolDefs = ANTHROPIC_TOOLS.map((tool, i) =>
    i === ANTHROPIC_TOOLS.length - 1
      ? { ...tool, cache_control: { type: "ephemeral" as const } }
      : tool
  );

  let iterations = 0;
  const maxIterations = 8;

  while (iterations < maxIterations) {
    iterations++;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemBlocks,
      tools: toolDefs,
      messages,
      ...(searchHint && iterations === 1
        ? { tool_choice: { type: "tool" as const, name: "search_products" } }
        : {}),
    });

    if (response.stop_reason === "end_turn") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return text || "Thanks for your message!";
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return text || "Thanks for your message!";
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tool of toolUses) {
      let input = tool.input as Record<string, unknown>;
      if (
        tool.name === "search_products" &&
        searchHint &&
        (!input.query ||
          String(input.query).includes("\n") ||
          String(input.query).length > 80)
      ) {
        input = { ...input, query: searchHint };
      }
      const executed = await executeSalesTool(tool.name, input, ctx);
      if (executed.escalated) {
        return "Got it — someone from our team will message you shortly 👍";
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tool.id,
        content: JSON.stringify(executed.result),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return "Thanks for your patience — a team member will follow up shortly.";
}
