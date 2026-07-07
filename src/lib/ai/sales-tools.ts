import {
  searchProducts,
  checkStock,
  createDraftOrder,
  getOrderStatus,
} from "@/lib/shopify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Store } from "@/lib/types";

export const SALES_SYSTEM_PROMPT = `You are a helpful, professional sales agent for an e-commerce store on WhatsApp.

Your goal is to help customers find products, answer questions about prices and details, and close sales.

CRITICAL — product questions:
- If the customer mentions a product name, asks for a price, or asks "do you have X" — you MUST call search_products first with the product name or keyword.
- Never say you don't have a product without calling search_products.
- Never invent product names, prices, or stock. Only use data returned by tools.
- When search_products returns results, tell the customer: product name, price(s), in-stock status, and a short description if available.
- For the most accurate price/stock on a specific size or color, call check_stock with that variant_id.
- If multiple variants exist (sizes/colors), list the options briefly and ask which they want.

Other rules:
- Use the full recent conversation history — short follow-ups like "what about large?" or "how much?" refer to products mentioned earlier.
- Be friendly, concise, and persuasive. Use short messages suitable for WhatsApp.
- When a customer wants to buy, confirm items and quantities, then use create_draft_order.
- Use get_order_status when customers ask about existing orders.
- Gently guide toward completing the purchase.
- If you cannot help (complaints, refunds, custom requests, or they ask for a human), call escalate_to_human.`;

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
      description:
        "Search the store catalog by product name or keyword. ALWAYS use this when the customer asks about a product, price, or availability.",
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
          "Shopify store is not connected. Please ask the merchant to connect their store in Integrations.",
      },
    };
  }

  const shopDomain = store.shop_domain!;
  const shopifyToken = store.shopify_access_token!;

  try {
    switch (name) {
      case "search_products": {
        const query = String(input.query ?? "").trim();
        if (!query) {
          return { result: { error: "Search query is required", products: [] } };
        }
        const products = await searchProducts(shopDomain, shopifyToken, query);
        return {
          result: {
            query,
            count: products.length,
            products,
            message:
              products.length === 0
                ? `No products found matching "${query}". Try a shorter keyword.`
                : `Found ${products.length} product(s).`,
          },
        };
      }

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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool execution failed";
    console.error(`[sales-agent] ${name} failed:`, err);
    return { result: { error: message } };
  }
}
