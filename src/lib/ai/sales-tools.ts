import {
  searchProducts,
  checkStock,
  createDraftOrder,
  getOrderStatus,
} from "@/lib/shopify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Store } from "@/lib/types";

export const SALES_SYSTEM_PROMPT = `You are a helpful, professional sales agent for an e-commerce store on WhatsApp.

Your goal is to help customers find products, answer questions, and close sales.

Rules:
- Be friendly, concise, and persuasive. Use short messages suitable for WhatsApp.
- NEVER quote prices or confirm availability without calling check_stock first.
- Use search_products when customers ask about items or browse.
- When a customer wants to buy, confirm items and quantities, then use create_draft_order.
- Use get_order_status when customers ask about existing orders.
- Gently guide toward completing the purchase (size, quantity, delivery confirmation).
- If you cannot help (complaints, refunds, custom requests, or they ask for a human), call escalate_to_human.
- Do not make up product information. Only use data from tool results.
- Currency is in the store's default currency.`;

export interface AgentContext {
  store: Store;
  conversationId: string;
  customerPhone: string;
  customerId: string | null;
}

export const OPENAI_SALES_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_products",
      description: "Search the store catalog by product name or keyword",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_stock",
      description: "Check real-time stock and price for a product variant",
      parameters: {
        type: "object",
        properties: {
          variant_id: { type: "string", description: "Shopify variant ID" },
        },
        required: ["variant_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_draft_order",
      description: "Create a draft order when the customer is ready to buy",
      parameters: {
        type: "object",
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
  },
  {
    type: "function" as const,
    function: {
      name: "get_order_status",
      description: "Look up order status by order number (e.g. #1001)",
      parameters: {
        type: "object",
        properties: {
          order_number: { type: "string" },
        },
        required: ["order_number"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "escalate_to_human",
      description: "Flag conversation for human agent handoff",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
        required: ["reason"],
      },
    },
  },
];

export async function executeSalesTool(
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
        error:
          "Shopify store is not connected. Please ask the merchant to connect their store.",
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
      });

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
