import {
  searchProducts,
  checkStock,
  getOrderStatus,
  getShopCurrency,
} from "@/lib/shopify";
import { formatMoney } from "@/lib/currency";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPortalOrder } from "@/lib/orders/confirm";
import { createWhatsAppAiOrder } from "@/lib/orders/whatsapp-create";
import type { Store } from "@/lib/types";
import type { ResolvedStoreAiConfig } from "./ai-settings-types";
import type { AdProductContext } from "@/lib/ads/types";
import {
  searchPortalProducts,
  getStoreProductBySku,
  extractSkuFromText,
  extractProductSearchQuery,
} from "@/lib/products/products-service";

export const SALES_SYSTEM_PROMPT = `You are a helpful, professional sales agent for an e-commerce store on WhatsApp.

Your goal is to help customers find products (portal catalog AND Shopify catalog), answer questions about prices and details, and ACTIVELY close sales — and to confirm or recover Shopify orders when that mode applies.

CRITICAL — conversation memory:
- You receive up to the last 10 messages from the current 2-hour session only. Older chat is not in your context — greet briefly as a fresh session if history is empty, but still help with orders via tools.
- Short follow-ups like "what about large?", "how much?", "yes", or "that one" refer to products already discussed in this session.

CRITICAL — customer order questions:
- If the customer asks about their order, status, tracking, delivery, or "where is my order" — call lookup_customer_orders (and get_order_status if they give an order number).
- Share clear details: order number, status, items, total (price_formatted), and tracking if available.
- Do not invent order details.

CRITICAL — currency and prices:
- The store has ONE currency (provided in your context as store_currency, e.g. PKR, USD).
- Tool results include price_formatted — ALWAYS show prices using price_formatted exactly.
- NEVER use $ or say "dollars" unless store_currency is USD.
- For PKR use Rs / PKR formatting from price_formatted. Never convert to another currency.

CRITICAL — product questions (portal + Shopify):
- search_products searches BOTH the portal catalog and Shopify products. Always use it for product name, SKU/ref, price, or "do you have X".
- If the customer gives a SKU or product code, call search_products with that exact SKU — then share full details (name, price_formatted, stock, description, variants).
- Never say you don't have a product without calling search_products.
- Never invent product names, prices, or stock. Only use data returned by tools.
- When search_products returns results, tell the customer: product name, price_formatted, in-stock status, short description, options (e.g. size/color), and list variants with their prices when present.
- If the customer asks about variants, sizes, or colors, read options + variants from the tool result and explain them clearly — do not invent options.
- Prefer portal catalog matches when SKU/ref is known; still mention Shopify matches when relevant.
- For the most accurate price/stock on a specific size or color, call check_stock with that variant_id (Shopify variants).

CRITICAL — always try to close the deal:
- Whenever the customer asks about a product (details, price, availability, SKU), after sharing details, warmly nudge toward purchase.
- Ask if they want to buy / place the order, then collect: full name, phone (confirm WhatsApp number), and full delivery address.
- When they are ready, call create_draft_order (requires name + phone + address).

CRITICAL — if they say they don't want to order (after you showed a product):
- Do NOT only say "thanks, how can I help". Stay in sales mode and recover the sale ONE STEP AT A TIME:
  1) First refusal → offer the SAME product at the store's configured recovery discount % (state the discounted price clearly). If they accept, collect name/phone/address/quantity and create_draft_order with that discount_percent.
  2) Second refusal → offer a 2-pack / bundle at the store's configured bundle discount % off the multi-unit total. If yes, create_draft_order for qty 2 (or their quantity) with that discount_percent.
  3) Third refusal → thank them politely and stop pushing. Do not keep discount-spamming.
- Never offer discount and bundle in the same message — one offer per reply.
- Always honor quantity (1+) when calculating totals: unit_price × qty × (1 − discount%/100).
- Hard stop only if they ask you to stop messaging / unsubscribe.

CRITICAL — WhatsApp purchases:
- Before create_draft_order you MUST have: full name, phone (the number they shared for confirmation), and full delivery address.
- Pass customer_name, phone, address1, city (and address2/province/zip/country when known), and optional discount_percent.
- For portal products (source=portal / UUID ids / AA- SKUs): pass sku and/or variant_id from search_products — orders are created in the portal and confirmed with WhatsApp to the customer phone.
- For Shopify products: pass the numeric Shopify variant_id.

CRITICAL — Shopify pending orders:
- Use confirm_order when the customer confirms a pending Shopify order.
- Use cancel_order when they cancel, then follow recovery offers in Shopify confirmation mode instructions.
- Use lookup_customer_orders / get_order_status when discussing existing orders.

Other rules:
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
        "Search BOTH portal catalog and Shopify products by name, keyword, or SKU/ref. ALWAYS use this when the customer asks about a product, price, availability, or gives a SKU. Returns full details including price_formatted.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Product name, keyword, or exact SKU/ref code",
          },
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
        "Create and confirm an order when the customer is ready to buy (portal catalog OR Shopify). Requires name + phone + full delivery address. For portal products use the product/variant id or sku from search_products (source=portal). For Shopify use numeric variant_id. Optional discount_percent for retention offers.",
      parameters: {
        type: "object",
        properties: {
          line_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                variant_id: {
                  type: "string",
                  description:
                    "Portal product/variant UUID or Shopify numeric variant id",
                },
                product_id: {
                  type: "string",
                  description: "Portal product id when known",
                },
                sku: {
                  type: "string",
                  description: "Portal product SKU (e.g. AA-…)",
                },
                source: {
                  type: "string",
                  description: "portal or shopify",
                },
                quantity: { type: "number" },
              },
              required: ["quantity"],
            },
          },
          customer_name: { type: "string" },
          phone: {
            type: "string",
            description:
              "Customer phone to receive order confirmation (use the number they shared)",
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
        required: ["line_items", "customer_name", "address1", "city", "phone"],
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
      name: "lookup_customer_orders",
      description:
        "List this customer's recent orders (by their WhatsApp phone). ALWAYS use when they ask about their order, status, delivery, or tracking without giving a number — or to find their orders before confirming/cancelling.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max orders to return (default 5)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_order_status",
      description:
        "Look up one order by order number (portal and/or Shopify). Use when the customer provides an order number like #1001.",
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
      .select(
        "id, status, order_number, source, total, currency, items, tracking_number, tracking_company, created_at, shipping_address"
      )
      .eq("store_id", storeId)
      .eq("order_number", candidate)
      .maybeSingle();
    if (data) return data as Record<string, unknown>;
  }

  const { data: rows } = await supabase
    .from("orders")
    .select(
      "id, status, order_number, source, total, currency, items, tracking_number, tracking_company, created_at, shipping_address"
    )
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

function formatOrderItems(
  items: unknown
): Array<{ title: string; quantity: number; price?: number }> {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const i = raw as { title?: string; name?: string; quantity?: number; price?: number };
    return {
      title: i.title || i.name || "item",
      quantity: Math.max(1, Number(i.quantity) || 1),
      price: i.price != null ? Number(i.price) : undefined,
    };
  });
}

async function findCustomerIdsForPhone(
  storeId: string,
  customerPhone: string
): Promise<string[]> {
  const supabase = createAdminClient();
  const phone = customerPhone.replace(/\D/g, "").trim();
  if (!phone) return [];

  const { data: customers } = await supabase
    .from("customers")
    .select("id, phone")
    .eq("store_id", storeId)
    .or(`phone.eq.${phone},phone.ilike.%${phone.slice(-10)}`)
    .limit(10);

  return (customers ?? []).map((c) => c.id as string);
}

export async function lookupOrdersForCustomerPhone(
  storeId: string,
  customerPhone: string,
  limit = 5
): Promise<
  Array<{
    order_number: string | null;
    status: string;
    source: string | null;
    total: number | null;
    currency: string | null;
    total_formatted: string;
    items: Array<{ title: string; quantity: number }>;
    tracking_number: string | null;
    tracking_company: string | null;
    created_at: string;
  }>
> {
  const supabase = createAdminClient();
  const phone = customerPhone.replace(/\D/g, "").trim();
  const customerIds = await findCustomerIdsForPhone(storeId, customerPhone);

  let query = supabase
    .from("orders")
    .select(
      "order_number, status, source, total, currency, items, tracking_number, tracking_company, created_at, shipping_address, customer_id"
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (customerIds.length > 0) {
    query = query.in("customer_id", customerIds);
  }

  const { data: byCustomer } = customerIds.length
    ? await query
    : { data: [] as Record<string, unknown>[] };

  // Also match shipping_address phone when customer_id is missing
  const { data: recent } = await supabase
    .from("orders")
    .select(
      "order_number, status, source, total, currency, items, tracking_number, tracking_company, created_at, shipping_address, customer_id"
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(80);

  const matched = new Map<string, Record<string, unknown>>();
  for (const o of byCustomer ?? []) {
    const id = String((o as { order_number?: string }).order_number ?? Math.random());
    matched.set(id, o as Record<string, unknown>);
  }
  for (const o of recent ?? []) {
    const addr = o.shipping_address as { phone?: string } | null;
    const addrPhone = String(addr?.phone ?? "").replace(/\D/g, "");
    if (
      phone &&
      addrPhone &&
      (addrPhone === phone ||
        addrPhone.endsWith(phone.slice(-10)) ||
        phone.endsWith(addrPhone.slice(-10)))
    ) {
      const key = String(o.order_number ?? o.created_at);
      matched.set(key, o as Record<string, unknown>);
    }
  }

  return Array.from(matched.values())
    .slice(0, limit)
    .map((o) => {
      const currency = (o.currency as string | null) ?? null;
      const total = o.total != null ? Number(o.total) : null;
      return {
        order_number: (o.order_number as string | null) ?? null,
        status: String(o.status ?? "unknown"),
        source: (o.source as string | null) ?? null,
        total,
        currency,
        total_formatted:
          currency != null && total != null
            ? formatMoney(total, currency)
            : String(total ?? ""),
        items: formatOrderItems(o.items),
        tracking_number: (o.tracking_number as string | null) ?? null,
        tracking_company: (o.tracking_company as string | null) ?? null,
        created_at: String(o.created_at ?? ""),
      };
    });
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
    name !== "lookup_customer_orders" &&
    name !== "get_order_status" &&
    name !== "create_draft_order" &&
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
        const rawQuery = String(input.query ?? "").trim();
        if (!rawQuery) {
          return { result: { error: "Search query is required", products: [] } };
        }

        // Prefer an embedded SKU, else cleaned product-name tokens
        const skuFromText = extractSkuFromText(rawQuery);
        const query =
          skuFromText ||
          extractProductSearchQuery(rawQuery) ||
          rawQuery.split(/\s+/).slice(0, 8).join(" ").trim();

        const exactPortal = await getStoreProductBySku(store.id, query);
        const portalProducts = await searchPortalProducts(store.id, query);

        // Also match Shopify products registered with a portal SKU for this store
        const supabaseSku = createAdminClient();
        const skuFilter = (skuFromText || query).replace(/[%_,()]/g, "").slice(0, 48);
        const { data: skuRows } = skuFilter
          ? await supabaseSku
              .from("shopify_product_skus")
              .select("sku, product_title, shopify_product_id, shopify_variant_id")
              .eq("store_id", store.id)
              .ilike("sku", `%${skuFilter}%`)
              .limit(10)
          : { data: null };

        const portalMapped = [
          ...(exactPortal
            ? [
                {
                  id: exactPortal.id,
                  title: exactPortal.name,
                  description:
                    exactPortal.description || exactPortal.tagline || null,
                  sku: exactPortal.sku,
                  source: "portal" as const,
                  currency: exactPortal.currency,
                  imageUrl: exactPortal.image_url,
                  options: (exactPortal.options ?? []).map((o) => ({
                    name: o.name,
                    values: o.values ?? [],
                  })),
                  bundles: (exactPortal.bundles ?? []).map((b) => ({
                    quantity: b.quantity,
                    price: String(b.price),
                    price_formatted: formatVariantPrice(
                      String(b.price),
                      exactPortal.currency
                    ),
                    label: b.label,
                  })),
                  variants:
                    (exactPortal.variants?.length ?? 0) > 0
                      ? exactPortal.variants!.map((v) => ({
                          id: v.id,
                          title: v.title,
                          sku: v.sku,
                          price: String(v.price ?? exactPortal.price),
                          currency: exactPortal.currency,
                          price_formatted: formatVariantPrice(
                            String(v.price ?? exactPortal.price),
                            exactPortal.currency
                          ),
                          option_values: v.option_values ?? {},
                          in_stock: true,
                        }))
                      : [
                          {
                            id: exactPortal.id,
                            title: "Default",
                            price: String(exactPortal.price),
                            currency: exactPortal.currency,
                            price_formatted: formatVariantPrice(
                              String(exactPortal.price),
                              exactPortal.currency
                            ),
                            in_stock: true,
                          },
                        ],
                },
              ]
            : []),
          ...portalProducts
            .filter((p) => !exactPortal || p.id !== exactPortal.id)
            .map((p) => ({
              id: p.id,
              title: p.title,
              description: p.description,
              sku: p.sku,
              source: "portal" as const,
              currency: p.currency,
              imageUrl: p.imageUrl,
              options: p.options ?? [],
              bundles: (p.bundles ?? []).map((b) => ({
                quantity: b.quantity,
                price: b.price,
                price_formatted: formatVariantPrice(b.price, p.currency),
                label: b.label,
              })),
              variants:
                (p.variants?.length ?? 0) > 0
                  ? p.variants.map((v) => ({
                      id: v.id,
                      title: v.title,
                      sku: v.sku,
                      price: v.price,
                      currency: p.currency,
                      price_formatted: formatVariantPrice(v.price, p.currency),
                      option_values: v.option_values ?? {},
                      in_stock: true,
                    }))
                  : [
                      {
                        id: p.id,
                        title: "Default",
                        price: p.price,
                        currency: p.currency,
                        price_formatted: formatVariantPrice(p.price, p.currency),
                        in_stock: true,
                      },
                    ],
            })),
        ];

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

          // Surface SKU registry hits that title search may have missed
          for (const row of skuRows ?? []) {
            const pid = String(row.shopify_product_id ?? "");
            if (!pid) continue;
            if (
              shopifyMapped.some(
                (p) => String((p as { id?: string }).id ?? "") === pid
              )
            ) {
              continue;
            }

            const variantId = String(row.shopify_variant_id || "").trim();
            let price = "0";
            let priceFormatted = "See store for price";
            let inStock = true;
            let variantTitle = "Default";

            if (variantId) {
              try {
                const stock = await checkStock(
                  shopDomain,
                  shopifyToken,
                  variantId
                );
                price = stock.price;
                priceFormatted = formatVariantPrice(
                  stock.price,
                  currency ?? "USD"
                );
                inStock = stock.in_stock;
                if (stock.title && stock.title !== "Default Title") {
                  variantTitle = stock.title;
                }
              } catch (err) {
                console.error(
                  `[search_products] SKU registry price fetch failed for ${variantId}:`,
                  err
                );
              }
            }

            shopifyMapped.unshift({
              id: pid,
              title: row.product_title || row.sku,
              description: `SKU ${row.sku}`,
              sku: row.sku,
              source: "shopify",
              currency,
              variants: [
                {
                  id: variantId || pid,
                  title: variantTitle,
                  price,
                  currency,
                  price_formatted: priceFormatted,
                  in_stock: inStock,
                },
              ],
            });
          }
        }

        const combined = [...portalMapped, ...shopifyMapped];
        const displayCurrency =
          currency ?? portalMapped[0]?.currency ?? "USD";

        return {
          result: {
            products: combined,
            count: combined.length,
            currency: displayCurrency,
            message:
              combined.length === 0
                ? "No matching products in portal or Shopify catalog."
                : "Share name, price_formatted, stock, description, options (size/color), and EVERY variant with its price_formatted when variants exist. Then ask if they want to buy and collect name, phone, and full address. Prefer portal matches when SKU/name is known.",
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

      case "lookup_customer_orders": {
        const limit = Math.min(10, Math.max(1, Number(input.limit) || 5));
        const orders = await lookupOrdersForCustomerPhone(
          store.id,
          customerPhone,
          limit
        );
        return {
          result: {
            count: orders.length,
            orders,
            message:
              orders.length === 0
                ? "No orders found for this customer phone. Ask for an order number if they have one."
                : "Share order_number, status, items, total_formatted, and tracking_number if present.",
          },
        };
      }

      case "get_order_status": {
        const orderNumber = String(input.order_number ?? "").trim();
        if (!orderNumber) {
          const orders = await lookupOrdersForCustomerPhone(
            store.id,
            customerPhone,
            5
          );
          return {
            result: {
              found: orders.length > 0,
              orders,
              message:
                orders.length === 0
                  ? "No order number given and no orders found for this phone."
                  : "No order number given — here are this customer's recent orders.",
            },
          };
        }

        const portalOrder = await findStoreOrderByNumber(store.id, orderNumber);
        if (portalOrder) {
          const orderCurrency =
            (portalOrder.currency as string | null) ?? currency ?? "USD";
          const total =
            portalOrder.total != null ? Number(portalOrder.total) : null;
          const items = formatOrderItems(portalOrder.items);
          return {
            result: {
              found: true,
              source: "portal",
              order_number: portalOrder.order_number,
              status: portalOrder.status,
              items,
              total,
              currency: orderCurrency,
              total_formatted:
                total != null ? formatMoney(total, orderCurrency) : undefined,
              tracking_number: portalOrder.tracking_number ?? null,
              tracking_company: portalOrder.tracking_company ?? null,
              created_at: portalOrder.created_at,
              message:
                "Share these details clearly with the customer. Include tracking if present.",
            },
          };
        }

        if (shopifyConnected) {
          const status = await getOrderStatus(
            shopDomain,
            shopifyToken,
            orderNumber
          );
          if (status.found && status.total) {
            return {
              result: {
                ...status,
                source: "shopify",
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

        return {
          result: {
            found: false,
            error: `Order ${orderNumber} not found in the portal.`,
          },
        };
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
        const city = String(input.city ?? "").trim() || "N/A";
        const phoneForOrder = String(input.phone ?? customerPhone).trim();
        if (!customerName || !address1) {
          return {
            result: {
              error:
                "customer_name and address1 are required before creating an order.",
            },
          };
        }
        if (!phoneForOrder) {
          return {
            result: {
              error:
                "phone is required — use the number the customer shared so we can send confirmation.",
            },
          };
        }

        const discountPercent =
          input.discount_percent != null
            ? Number(input.discount_percent)
            : undefined;

        const rawLines = Array.isArray(input.line_items)
          ? (input.line_items as Array<Record<string, unknown>>)
          : [];

        const created = await createWhatsAppAiOrder({
          store,
          conversationCustomerId: customerId,
          conversationPhone: customerPhone,
          lineItems: rawLines.map((li) => ({
            variant_id:
              li.variant_id != null ? String(li.variant_id) : undefined,
            product_id:
              li.product_id != null ? String(li.product_id) : undefined,
            sku: li.sku != null ? String(li.sku) : undefined,
            source: li.source != null ? String(li.source) : undefined,
            quantity: Number(li.quantity) || 1,
          })),
          shipping: {
            customer_name: customerName,
            phone: phoneForOrder,
            address1,
            address2: String(input.address2 ?? "").trim() || undefined,
            city,
            province: String(input.province ?? "").trim() || undefined,
            country: String(input.country ?? "").trim() || undefined,
            zip: String(input.zip ?? "").trim() || undefined,
          },
          discountPercent,
          storeCurrency: currency ?? ctx.storeCurrency,
        });

        if (!created.ok) {
          return { result: { error: created.error } };
        }

        return {
          result: {
            success: true,
            order_number: created.order_number,
            total: created.total,
            currency: created.currency,
            total_formatted: created.total_formatted,
            confirmed: created.confirmed,
            confirm_error: created.confirm_error,
            whatsapp_sent: created.whatsapp_sent,
            whatsapp_error: created.whatsapp_error,
            source: created.source,
            message: created.message,
          },
          orderCreated: created.order_id,
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

/** Load pending + recent orders for this customer phone to inject into the prompt. */
export async function getPendingOrdersHintForPhone(
  storeId: string,
  customerPhone: string
): Promise<string | null> {
  const orders = await lookupOrdersForCustomerPhone(storeId, customerPhone, 5);
  if (!orders.length) return null;

  const lines = orders.map((o) => {
    const items = o.items
      .map((i) => `${i.quantity}x ${i.title}`)
      .join(", ");
    const tracking = o.tracking_number
      ? ` · tracking ${o.tracking_company ? `${o.tracking_company} ` : ""}${o.tracking_number}`
      : "";
    return `- ${o.order_number ?? "?"} (${o.source ?? "order"}): ${items || "items"} · ${o.total_formatted} · status ${o.status}${tracking}`;
  });

  return `Orders for this customer (use lookup_customer_orders / get_order_status / confirm_order / cancel_order as needed):\n${lines.join("\n")}`;
}
