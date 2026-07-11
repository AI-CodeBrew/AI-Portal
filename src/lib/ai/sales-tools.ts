import {
  searchProducts,
  checkStock,
  createDraftOrder,
  getOrderStatus,
  getShopCurrency,
} from "@/lib/shopify";
import { formatMoney } from "@/lib/currency";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPortalOrder } from "@/lib/orders/confirm";
import type { Store } from "@/lib/types";
import type { ResolvedStoreAiConfig } from "./ai-settings-types";
import type { AdProductContext } from "@/lib/ads/types";
import { searchPortalProducts } from "@/lib/products/products-service";

export const SALES_SYSTEM_PROMPT = `You are a helpful, professional sales agent for an e-commerce store on WhatsApp.

Your goal is to help customers find products, answer questions about prices and details, and close sales — and to confirm or recover Shopify orders when that mode applies.

CRITICAL — currency and prices:
- The store has ONE currency (provided in your context as store_currency, e.g. PKR, USD).
- Tool results include price_formatted — ALWAYS show prices using price_formatted exactly.
- NEVER use $ or say "dollars" unless store_currency is USD.
- For PKR use Rs / PKR formatting from price_formatted. Never convert to another currency.

CRITICAL — product questions:
- If the customer mentions a product name, asks for a price, or asks "do you have X" — you MUST call search_products first with the product name or keyword.
- Never say you don't have a product without calling search_products.
- Never invent product names, prices, or stock. Only use data returned by tools.
- When search_products returns results, tell the customer: product name, price_formatted, in-stock status, and a short description if available.
- For the most accurate price/stock on a specific size or color, call check_stock with that variant_id.
- If multiple variants exist (sizes/colors), list the options briefly and ask which they want.

CRITICAL — WhatsApp purchases:
- Before create_draft_order you MUST have: full name, phone (confirm WhatsApp number), and full delivery address.
- Pass customer_name, address1, city (and address2/province/zip/country when known), and optional discount_percent.

CRITICAL — Shopify pending orders:
- Use confirm_order when the customer confirms a pending Shopify order.
- Use cancel_order when they cancel, then follow recovery offers in Shopify confirmation mode instructions.
- Use get_order_status or pending order context when discussing existing orders.

Other rules:
- Use the full recent conversation history — short follow-ups like "what about large?" or "how much?" refer to products mentioned earlier.
- Be friendly, concise, and persuasive. Use short messages suitable for WhatsApp.
- If you cannot help (complaints, refunds, custom requests, or they ask for a human), call escalate_to_human.`;

export interface AgentContext {
  store: Store;
  conversationId: string;
  customerPhone: string;
  customerId: string | null;
  storeCurrency?: string | null;
  aiConfig?: ResolvedStoreAiConfig | null;
  adProductContext?: AdProductContext | null;
  /** Injected pending Shopify orders for this phone */
  pendingOrdersHint?: string | null;
}

function formatVariantPrice(price: string, currency: string) {
  return formatMoney(parseFloat(price), currency);
}

function normalizeOrderNumber(value: string): string {
  return value.trim().replace(/^#/, "");
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
      description:
        "Create and confirm an order when the customer is ready to buy. Requires name + full delivery address. Optional discount_percent for retention offers.",
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
          phone: {
            type: "string",
            description: "Customer phone if different from WhatsApp number",
          },
          address1: { type: "string", description: "Street / house address" },
          address2: { type: "string" },
          city: { type: "string" },
          province: { type: "string" },
          country: { type: "string" },
          zip: { type: "string" },
          discount_percent: {
            type: "number",
            description: "Optional percentage discount (e.g. 15 or 25)",
          },
        },
        required: ["line_items", "customer_name", "address1", "city"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "confirm_order",
      description:
        "Confirm a pending portal/Shopify order after the customer agrees. Punches confirmation in portal + Shopify and notifies the customer.",
      parameters: {
        type: "object",
        properties: {
          order_number: {
            type: "string",
            description: "Order number e.g. #1001",
          },
        },
        required: ["order_number"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "cancel_order",
      description:
        "Cancel a pending portal order when the customer declines. Then follow recovery discount/bundle instructions.",
      parameters: {
        type: "object",
        properties: {
          order_number: { type: "string" },
          reason: { type: "string" },
        },
        required: ["order_number"],
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

async function findStoreOrderByNumber(
  storeId: string,
  orderNumber: string
): Promise<Record<string, unknown> | null> {
  const supabase = createAdminClient();
  const raw = normalizeOrderNumber(orderNumber);
  const candidates = Array.from(
    new Set([orderNumber.trim(), raw, `#${raw}`, `Order ${raw}`])
  );

  for (const candidate of candidates) {
    const { data } = await supabase
      .from("orders")
      .select("id, status, order_number, source, total, currency, items")
      .eq("store_id", storeId)
      .eq("order_number", candidate)
      .maybeSingle();
    if (data) return data as Record<string, unknown>;
  }

  // Fallback: match without leading #
  const { data: rows } = await supabase
    .from("orders")
    .select("id, status, order_number, source, total, currency, items")
    .eq("store_id", storeId)
    .ilike("order_number", `%${raw}%`)
    .order("created_at", { ascending: false })
    .limit(5);

  const match = (rows ?? []).find((r) => {
    const n = normalizeOrderNumber(String(r.order_number ?? ""));
    return n === raw || n.endsWith(raw);
  });
  return (match as Record<string, unknown> | undefined) ?? null;
}

export async function executeSalesTool(
  name: string,
  input: Record<string, unknown>,
  ctx: AgentContext
): Promise<{ result: unknown; escalated?: boolean; orderCreated?: string }> {
  const { store, conversationId, customerPhone, customerId } = ctx;
  const supabase = createAdminClient();

  const shopifyConnected = Boolean(
    store.shop_domain && store.shopify_access_token
  );

  if (
    name !== "escalate_to_human" &&
    name !== "search_products" &&
    name !== "confirm_order" &&
    name !== "cancel_order" &&
    !shopifyConnected
  ) {
    return {
      result: {
        error:
          "Shopify store is not connected. Please ask the merchant to connect their store in Integrations.",
      },
    };
  }

  const shopDomain = store.shop_domain ?? "";
  const shopifyToken = store.shopify_access_token ?? "";

  let currency = ctx.storeCurrency ?? null;
  if (!currency && shopifyConnected) {
    try {
      currency = await getShopCurrency(shopDomain, shopifyToken);
    } catch (err) {
      console.error("[sales-agent] Failed to fetch shop currency:", err);
    }
  }

  try {
    switch (name) {
      case "search_products": {
        const query = String(input.query ?? "").trim();
        if (!query) {
          return { result: { error: "Search query is required", products: [] } };
        }

        const portalProducts = await searchPortalProducts(store.id, query);
        const portalMapped = portalProducts.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          sku: p.sku,
          source: "portal" as const,
          currency: p.currency,
          imageUrl: p.imageUrl,
          variants: [
            {
              id: p.id,
              title: "Default",
              price: p.price,
              currency: p.currency,
              price_formatted: formatVariantPrice(p.price, p.currency),
              in_stock: true,
            },
          ],
        }));

        let shopifyMapped: Array<Record<string, unknown>> = [];
        if (shopifyConnected) {
          const products = await searchProducts(
            shopDomain,
            shopifyToken,
            query
          );
          shopifyMapped = products.map((p) => ({
            ...p,
            source: "shopify",
            currency,
            variants: p.variants.map((v) => ({
              ...v,
              currency,
              price_formatted: formatVariantPrice(v.price, currency ?? "USD"),
            })),
          }));
        }

        const combined = [...portalMapped, ...shopifyMapped];
        const displayCurrency =
          currency ?? portalMapped[0]?.currency ?? "USD";

        return {
          result: {
            query,
            currency: displayCurrency,
            count: combined.length,
            products: combined,
            message:
              combined.length === 0
                ? `No products found matching "${query}". Try a shorter keyword or the product SKU.`
                : `Found ${combined.length} product(s). Prefer portal catalog matches when SKU/ref is known.`,
          },
        };
      }

      case "check_stock": {
        const stock = await checkStock(
          shopDomain,
          shopifyToken,
          input.variant_id as string
        );
        return {
          result: {
            ...stock,
            currency,
            price_formatted: formatVariantPrice(
              stock.price,
              currency ?? "USD"
            ),
          },
        };
      }

      case "get_order_status": {
        const status = await getOrderStatus(
          shopDomain,
          shopifyToken,
          input.order_number as string
        );
        if (status.found && status.total) {
          return {
            result: {
              ...status,
              currency,
              total_formatted: formatMoney(
                parseFloat(status.total),
                currency ?? "USD"
              ),
            },
          };
        }
        return { result: { ...status, currency } };
      }

      case "confirm_order": {
        const orderNumber = String(input.order_number ?? "").trim();
        if (!orderNumber) {
          return { result: { error: "order_number is required" } };
        }
        const order = await findStoreOrderByNumber(store.id, orderNumber);
        if (!order) {
          return { result: { error: `Order ${orderNumber} not found` } };
        }
        if (order.status === "confirmed") {
          return {
            result: {
              success: true,
              already_confirmed: true,
              order_number: order.order_number,
              message: "Order was already confirmed.",
            },
          };
        }
        if (order.status === "cancelled") {
          return {
            result: {
              error: "Order is cancelled and cannot be confirmed.",
            },
          };
        }

        const result = await confirmPortalOrder(String(order.id), {
          email: "whatsapp-ai@system",
          role: "system",
          storeId: store.id,
        });

        if ("error" in result) {
          return { result: { error: result.error } };
        }

        return {
          result: {
            success: true,
            order_number: order.order_number,
            whatsapp_sent: result.whatsapp_sent,
            shopify_sync_status: result.shopify_sync_status,
            message:
              "Order confirmed in portal and Shopify. Confirmation + dispatch details were sent to the customer when WhatsApp is connected. Tell them the order is confirmed and being prepared for dispatch.",
          },
        };
      }

      case "cancel_order": {
        const orderNumber = String(input.order_number ?? "").trim();
        if (!orderNumber) {
          return { result: { error: "order_number is required" } };
        }
        const order = await findStoreOrderByNumber(store.id, orderNumber);
        if (!order) {
          return { result: { error: `Order ${orderNumber} not found` } };
        }
        if (order.status === "cancelled") {
          return {
            result: {
              success: true,
              already_cancelled: true,
              order_number: order.order_number,
            },
          };
        }
        if (order.status === "confirmed") {
          return {
            result: {
              error:
                "Order is already confirmed. Escalate to human for refunds/cancellations.",
            },
          };
        }

        const reason = String(input.reason ?? "Customer cancelled via WhatsApp AI");
        const { error } = await supabase
          .from("orders")
          .update({
            status: "cancelled",
            shopify_sync_error: reason.slice(0, 500),
          })
          .eq("id", String(order.id))
          .eq("store_id", store.id);

        if (error) {
          return { result: { error: error.message } };
        }

        return {
          result: {
            success: true,
            order_number: order.order_number,
            items: order.items,
            total: order.total,
            currency: order.currency,
            message:
              "Order cancelled in portal. Now offer 15% discount on the same product; if refused, offer a 2-pack bundle with ~20–25% off.",
          },
        };
      }

      case "create_draft_order": {
        const customerName = String(input.customer_name ?? "").trim();
        const address1 = String(input.address1 ?? "").trim();
        const city = String(input.city ?? "").trim();
        if (!customerName || !address1 || !city) {
          return {
            result: {
              error:
                "customer_name, address1, and city are required before creating an order.",
            },
          };
        }

        const phoneForOrder = String(input.phone ?? customerPhone).trim();
        const discountPercent =
          input.discount_percent != null
            ? Number(input.discount_percent)
            : undefined;

        const shippingAddress = {
          address1,
          address2: String(input.address2 ?? "").trim() || undefined,
          city,
          province: String(input.province ?? "").trim() || undefined,
          country: String(input.country ?? "").trim() || undefined,
          zip: String(input.zip ?? "").trim() || undefined,
        };

        const draft = await createDraftOrder(shopDomain, shopifyToken, {
          phone: phoneForOrder,
          name: customerName,
          lineItems: input.line_items as Array<{
            variant_id: string;
            quantity: number;
          }>,
          discountPercent,
          shippingAddress,
        });

        let custId = customerId;
        if (!custId) {
          const { data: cust } = await supabase
            .from("customers")
            .upsert(
              {
                store_id: store.id,
                phone: phoneForOrder,
                name: customerName,
              },
              { onConflict: "store_id,phone" }
            )
            .select("id")
            .single();
          custId = cust?.id ?? null;
        }

        const portalShipping = {
          name: customerName,
          phone: phoneForOrder,
          ...shippingAddress,
        };

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
            shipping_address: portalShipping,
          })
          .select("id")
          .single();

        let confirmed = false;
        let confirmError: string | undefined;
        if (order?.id) {
          const confirmResult = await confirmPortalOrder(order.id, {
            email: "whatsapp-ai@system",
            role: "system",
            storeId: store.id,
          });
          if ("error" in confirmResult) {
            confirmError = confirmResult.error;
          } else {
            confirmed = true;
          }
        }

        return {
          result: {
            success: true,
            order_number: draft.order_number,
            total: draft.total,
            currency: draft.currency ?? currency,
            total_formatted: formatMoney(
              draft.total,
              draft.currency ?? currency ?? "USD"
            ),
            confirmed,
            confirm_error: confirmError,
            message: confirmed
              ? "Order punched in portal and Shopify, confirmation + dispatch WhatsApp sent. Tell the customer their order is confirmed and being prepared for dispatch."
              : "Draft order created in portal. Confirmation step had an issue — tell the customer a team member will finalize shortly.",
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

/** Load pending Shopify orders for this customer phone to inject into the prompt. */
export async function getPendingOrdersHintForPhone(
  storeId: string,
  customerPhone: string
): Promise<string | null> {
  const supabase = createAdminClient();
  const phone = customerPhone.replace(/\D/g, "").trim();
  if (!phone) return null;

  const { data: customers } = await supabase
    .from("customers")
    .select("id, phone")
    .eq("store_id", storeId)
    .or(`phone.eq.${phone},phone.ilike.%${phone.slice(-10)}`)
    .limit(10);

  const customerIds = (customers ?? []).map((c) => c.id as string);
  if (customerIds.length === 0) return null;

  const { data: orders } = await supabase
    .from("orders")
    .select("order_number, total, currency, items, source, status")
    .eq("store_id", storeId)
    .eq("status", "pending")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!orders?.length) return null;

  const lines = orders.map((o) => {
    const items = (
      (o.items as Array<{ title?: string; quantity?: number }>) ?? []
    )
      .map((i) => `${i.quantity ?? 1}x ${i.title ?? "item"}`)
      .join(", ");
    const total =
      o.currency != null
        ? formatMoney(Number(o.total ?? 0), String(o.currency))
        : String(o.total ?? "");
    return `- ${o.order_number ?? "?"} (${o.source}): ${items || "items"} · ${total} · status pending`;
  });

  return `Pending orders for this customer (use confirm_order / cancel_order):\n${lines.join("\n")}`;
}
