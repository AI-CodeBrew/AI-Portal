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
    description: "Create a draft order when the customer is ready to buy",
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
      },
      required: ["line_items"],
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
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock?.type === "text"
        ? textBlock.text
        : "Thanks for your message! How can I help you today?";
    }

    if (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        const { result, escalated } = await executeSalesTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          ctx
        );

        if (escalated) {
          return "I've connected you with our team. A human agent will be with you shortly. Thank you for your patience!";
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    break;
  }

  return "I'm having trouble processing your request. Let me get a team member to help you.";
}
