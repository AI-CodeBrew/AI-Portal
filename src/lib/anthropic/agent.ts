import Anthropic from "@anthropic-ai/sdk";
import {
  searchProducts,
  checkStock,
  createDraftOrder,
  getOrderStatus,
} from "@/lib/shopify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Store } from "@/lib/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a helpful, professional sales agent for an e-commerce store on WhatsApp.

Rules:
- Be friendly, concise, and helpful. Use short messages suitable for WhatsApp.
- NEVER quote prices or confirm availability without calling check_stock first.
- Use search_products to find products when customers ask about items.
- When a customer wants to buy, confirm the items and quantities, then use create_draft_order.
- Use get_order_status when customers ask about existing orders.
- If you cannot help (complex complaints, refunds, custom requests, or the customer asks for a human), call escalate_to_human.
- Do not make up product information. Only use data from tool results.
- Currency is in the store's default currency.`;

const TOOLS: Anthropic.Tool[] = [
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

interface AgentContext {
  store: Store;
  conversationId: string;
  customerPhone: string;
  customerId: string | null;
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: AgentContext
): Promise<{ result: unknown; escalated?: boolean; orderCreated?: string }> {
  const { store, conversationId, customerPhone, customerId } = ctx;
  const supabase = createAdminClient();

  if (
    name !== "escalate_to_human" &&
    (!store.shop_domain || !store.shopify_access_token)
  ) {
    return {
      result: {
        error: "Shopify store is not connected. Please ask the merchant to connect their store.",
      },
    };
  }

  const shopDomain = store.shop_domain!;
  const shopifyToken = store.shopify_access_token!;

  switch (name) {
    case "search_products":
      return {
        result: await searchProducts(
          shopDomain,
          shopifyToken,
          input.query as string
        ),
      };

    case "check_stock":
      return {
        result: await checkStock(
          shopDomain,
          shopifyToken,
          input.variant_id as string
        ),
      };

    case "get_order_status":
      return {
        result: await getOrderStatus(
          shopDomain,
          shopifyToken,
          input.order_number as string
        ),
      };

    case "create_draft_order": {
      const draft = await createDraftOrder(shopDomain, shopifyToken, {
          phone: customerPhone,
          name: input.customer_name as string | undefined,
          lineItems: input.line_items as Array<{
            variant_id: string;
            quantity: number;
          }>,
        }
      );

      let custId = customerId;
      if (!custId) {
        const { data: cust } = await supabase
          .from("customers")
          .upsert(
            {
              store_id: store.id,
              phone: customerPhone,
              name: (input.customer_name as string) ?? null,
            },
            { onConflict: "store_id,phone" }
          )
          .select("id")
          .single();
        custId = cust?.id ?? null;
      }

      const { data: order } = await supabase
        .from("orders")
        .insert({
          store_id: store.id,
          customer_id: custId,
          shopify_draft_order_id: draft.draft_order_id,
          order_number: draft.order_number,
          items: draft.items,
          total: draft.total,
          currency: draft.currency,
          status: "pending",
          source: "whatsapp_ai",
        })
        .select("id")
        .single();

      return {
        result: {
          success: true,
          order_number: draft.order_number,
          total: draft.total,
          message:
            "Draft order created. A team member will confirm it shortly.",
        },
        orderCreated: order?.id,
      };
    }

    case "escalate_to_human":
      await supabase
        .from("whatsapp_conversations")
        .update({ status: "human_handoff" })
        .eq("id", conversationId);
      return {
        result: { escalated: true, reason: input.reason },
        escalated: true,
      };

    default:
      return { result: { error: `Unknown tool: ${name}` } };
  }
}

export async function runSalesAgent(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ];

  const toolDefs = TOOLS.map((tool, i) =>
    i === TOOLS.length - 1
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
        const { result, escalated } = await executeTool(
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
