import Anthropic from "@anthropic-ai/sdk";
import { executeSalesTool, type AgentContext } from "./sales-tools";
import { buildSalesSystemPrompt } from "./build-system-prompt";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANTHROPIC_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_products",
    description: "Search the store catalog by product name or keyword",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
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
      "Create and confirm an order when ready. Requires name + address. Optional discount_percent.",
    input_schema: {
      type: "object" as const,
      properties: {
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              variant_id: { type: "string" },
              quantity: { type: "number" },
            },
            required: ["variant_id", "quantity"],
          },
        },
        customer_name: { type: "string" },
        phone: { type: "string" },
        address1: { type: "string" },
        address2: { type: "string" },
        city: { type: "string" },
        province: { type: "string" },
        country: { type: "string" },
        zip: { type: "string" },
        discount_percent: { type: "number" },
      },
      required: ["line_items", "customer_name", "address1", "city"],
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
    name: "get_order_status",
    description: "Look up order status by order number (e.g. #1001)",
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

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
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
      const executed = await executeSalesTool(
        tool.name,
        tool.input as Record<string, unknown>,
        ctx
      );
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
