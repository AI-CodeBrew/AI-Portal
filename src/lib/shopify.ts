import { decrypt } from "./crypto";
import type { OrderItem } from "./types";
import { getAppUrl } from "./app-url";

export { getAppUrl };

export const DEFAULT_SHOPIFY_SCOPES =
  "read_orders,write_orders,read_products,read_customers,write_draft_orders";

const API_VERSION = "2024-10";

export interface ShopifyAppCredentials {
  apiKey: string;
  apiSecret: string;
  scopes?: string;
}

export function getShopifyAuthUrl(
  shop: string,
  state: string,
  creds: ShopifyAppCredentials,
  appUrl?: string
): string {
  const redirectUri = `${appUrl ?? getAppUrl()}/auth/shopify/callback`;
  const scopes = creds.scopes ?? DEFAULT_SHOPIFY_SCOPES;

  const params = new URLSearchParams({
    client_id: creds.apiKey,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  });

  return `https://${shop}/admin/oauth/authorize?${params}`;
}

export async function exchangeShopifyToken(
  shop: string,
  code: string,
  creds: ShopifyAppCredentials
): Promise<string> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: creds.apiKey,
      client_secret: creds.apiSecret,
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`Shopify token exchange failed: ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export function resolveShopifySecret(
  encryptedOrPlain: string | null
): string | null {
  if (!encryptedOrPlain) return null;
  try {
    return decrypt(encryptedOrPlain);
  } catch {
    return encryptedOrPlain;
  }
}

export async function shopifyAdminFetch(
  shopDomain: string,
  encryptedToken: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = decrypt(encryptedToken);
  const url = `https://${shopDomain}/admin/api/${API_VERSION}${path}`;

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
      ...options.headers,
    },
  });
}

export async function registerShopifyWebhooks(
  shopDomain: string,
  encryptedToken: string,
  appUrl?: string
): Promise<void> {
  const baseUrl = `${appUrl ?? getAppUrl()}/api/webhook/shopify`;
  const topics = ["orders/create", "orders/updated"];

  for (const topic of topics) {
    const res = await shopifyAdminFetch(shopDomain, encryptedToken, "/webhooks.json", {
      method: "POST",
      body: JSON.stringify({
        webhook: {
          topic,
          address: baseUrl,
          format: "json",
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (!text.includes("already been taken")) {
        console.error(`Failed to register webhook ${topic}:`, text);
      }
    }
  }
}

export interface ShopifyOrder {
  id: number;
  name: string;
  order_number: number;
  total_price: string;
  currency?: string;
  presentment_currency?: string;
  created_at?: string;
  phone?: string;
  customer?: {
    id: number;
    phone?: string;
    first_name?: string;
    last_name?: string;
  };
  line_items: Array<{
    title: string;
    quantity: number;
    price: string;
    variant_id: number;
    product_id: number;
  }>;
}

export function getShopifyOrderCurrency(order: ShopifyOrder): string {
  return (order.presentment_currency || order.currency || "").toUpperCase();
}

export function parseShopifyOrder(order: ShopifyOrder): {
  phone: string | null;
  name: string | null;
  shopifyCustomerId: string | null;
  items: OrderItem[];
  total: number;
  orderNumber: string;
  currency: string | null;
} {
  const phone = order.phone || order.customer?.phone || null;

  const name = order.customer
    ? [order.customer.first_name, order.customer.last_name]
        .filter(Boolean)
        .join(" ") || null
    : null;

  const items: OrderItem[] = order.line_items.map((li) => ({
    title: li.title,
    quantity: li.quantity,
    price: parseFloat(li.price),
    variant_id: String(li.variant_id),
    product_id: String(li.product_id),
  }));

  return {
    phone,
    name,
    shopifyCustomerId: order.customer?.id
      ? String(order.customer.id)
      : null,
    items,
    total: parseFloat(order.total_price),
    orderNumber: order.name || `#${order.order_number}`,
    currency: getShopifyOrderCurrency(order) || null,
  };
}

export async function searchProducts(
  shopDomain: string,
  encryptedToken: string,
  query: string
) {
  const params = new URLSearchParams({ title: query, limit: "10" });
  const res = await shopifyAdminFetch(
    shopDomain,
    encryptedToken,
    `/products.json?${params}`
  );
  if (!res.ok) throw new Error(`Product search failed: ${await res.text()}`);
  const data = (await res.json()) as {
    products: Array<{
      id: number;
      title: string;
      variants: Array<{
        id: number;
        title: string;
        price: string;
        inventory_quantity: number;
      }>;
    }>;
  };
  return data.products.map((p) => ({
    id: p.id,
    title: p.title,
    variants: p.variants.map((v) => ({
      id: v.id,
      title: v.title,
      price: v.price,
      inventory_quantity: v.inventory_quantity,
    })),
  }));
}

export async function checkStock(
  shopDomain: string,
  encryptedToken: string,
  variantId: string
) {
  const res = await shopifyAdminFetch(
    shopDomain,
    encryptedToken,
    `/variants/${variantId}.json`
  );
  if (!res.ok) throw new Error(`Stock check failed: ${await res.text()}`);
  const data = (await res.json()) as {
    variant: {
      id: number;
      title: string;
      price: string;
      inventory_quantity: number;
      product_id: number;
    };
  };
  return {
    variant_id: data.variant.id,
    title: data.variant.title,
    price: data.variant.price,
    inventory_quantity: data.variant.inventory_quantity,
    product_id: data.variant.product_id,
    in_stock: data.variant.inventory_quantity > 0,
  };
}

export async function createDraftOrder(
  shopDomain: string,
  encryptedToken: string,
  params: {
    phone: string;
    name?: string;
    lineItems: Array<{ variant_id: string; quantity: number }>;
    note?: string;
  }
) {
  const res = await shopifyAdminFetch(
    shopDomain,
    encryptedToken,
    "/draft_orders.json",
    {
      method: "POST",
      body: JSON.stringify({
        draft_order: {
          line_items: params.lineItems.map((li) => ({
            variant_id: Number(li.variant_id),
            quantity: li.quantity,
          })),
          note: params.note ?? "Created via WhatsApp AI agent",
          tags: "whatsapp_ai",
          shipping_address: params.name
            ? { phone: params.phone, name: params.name }
            : { phone: params.phone },
        },
      }),
    }
  );

  if (!res.ok) throw new Error(`Draft order failed: ${await res.text()}`);
  const data = (await res.json()) as {
    draft_order: {
      id: number;
      name: string;
      total_price: string;
      currency?: string;
      presentment_currency?: string;
      line_items: Array<{
        title: string;
        quantity: number;
        price: string;
        variant_id: number;
        product_id: number;
      }>;
    };
  };

  const draft = data.draft_order;
  return {
    draft_order_id: String(draft.id),
    order_number: draft.name,
    total: parseFloat(draft.total_price),
    currency:
      (draft.presentment_currency || draft.currency || "").toUpperCase() || null,
    items: draft.line_items.map((li) => ({
      title: li.title,
      quantity: li.quantity,
      price: parseFloat(li.price),
      variant_id: String(li.variant_id),
      product_id: String(li.product_id),
    })),
  };
}

export async function getOrderStatus(
  shopDomain: string,
  encryptedToken: string,
  orderName: string
) {
  const params = new URLSearchParams({ name: orderName, status: "any" });
  const res = await shopifyAdminFetch(
    shopDomain,
    encryptedToken,
    `/orders.json?${params}`
  );
  if (!res.ok) throw new Error(`Order lookup failed: ${await res.text()}`);
  const data = (await res.json()) as {
    orders: Array<{
      name: string;
      financial_status: string;
      fulfillment_status: string | null;
      total_price: string;
    }>;
  };
  if (data.orders.length === 0) return { found: false as const };
  const order = data.orders[0];
  return {
    found: true as const,
    order_number: order.name,
    financial_status: order.financial_status,
    fulfillment_status: order.fulfillment_status,
    total: order.total_price,
  };
}

export async function confirmOrderOnShopify(
  shopDomain: string,
  encryptedToken: string,
  order: {
    shopify_order_id: string | null;
    shopify_draft_order_id: string | null;
  },
  confirmedBy: string
): Promise<{
  ok: boolean;
  shopifyOrderId?: string;
  error?: string;
}> {
  const note = `Confirmed via portal by ${confirmedBy} at ${new Date().toISOString()}`;

  if (order.shopify_draft_order_id) {
    const res = await shopifyAdminFetch(
      shopDomain,
      encryptedToken,
      `/draft_orders/${order.shopify_draft_order_id}/complete.json`,
      { method: "PUT" }
    );
    if (!res.ok) {
      return { ok: false, error: await res.text() };
    }
    const data = (await res.json()) as {
      draft_order: { order_id: number };
    };
    return { ok: true, shopifyOrderId: String(data.draft_order.order_id) };
  }

  if (order.shopify_order_id) {
    const getRes = await shopifyAdminFetch(
      shopDomain,
      encryptedToken,
      `/orders/${order.shopify_order_id}.json`
    );
    let existingTags = "";
    if (getRes.ok) {
      const getData = (await getRes.json()) as {
        order: { tags: string };
      };
      existingTags = getData.order.tags ?? "";
    }

    const tags = existingTags
      ? `${existingTags}, portal_confirmed`
      : "portal_confirmed";

    const res = await shopifyAdminFetch(
      shopDomain,
      encryptedToken,
      `/orders/${order.shopify_order_id}.json`,
      {
        method: "PUT",
        body: JSON.stringify({
          order: {
            id: Number(order.shopify_order_id),
            tags,
            note,
          },
        }),
      }
    );

    if (!res.ok) {
      return { ok: false, error: await res.text() };
    }
    return { ok: true, shopifyOrderId: order.shopify_order_id };
  }

  return { ok: false, error: "No Shopify order ID linked" };
}

function parsePageInfoFromLink(link: string | null): {
  next: string | null;
  previous: string | null;
} {
  if (!link) return { next: null, previous: null };
  let next: string | null = null;
  let previous: string | null = null;
  for (const part of link.split(",")) {
    const match = part.trim().match(/<([^>]+)>;\s*rel="(\w+)"/);
    if (!match) continue;
    const url = new URL(match[1]);
    const pageInfo = url.searchParams.get("page_info");
    if (match[2] === "next") next = pageInfo;
    if (match[2] === "previous") previous = pageInfo;
  }
  return { next, previous };
}

export async function getShopifyOrderCount(
  shopDomain: string,
  encryptedToken: string
): Promise<number> {
  const res = await shopifyAdminFetch(
    shopDomain,
    encryptedToken,
    "/orders/count.json?status=any"
  );
  if (!res.ok) throw new Error(`Order count failed: ${await res.text()}`);
  const data = (await res.json()) as { count: number };
  return data.count;
}

export async function fetchShopifyOrdersPage(
  shopDomain: string,
  encryptedToken: string,
  options: { limit?: number; pageInfo?: string } = {}
): Promise<{
  orders: ShopifyOrder[];
  nextPageInfo: string | null;
  previousPageInfo: string | null;
}> {
  const limit = options.limit ?? 25;
  let path: string;

  if (options.pageInfo) {
    path = `/orders.json?limit=${limit}&page_info=${encodeURIComponent(options.pageInfo)}`;
  } else {
    const params = new URLSearchParams({
      status: "any",
      limit: String(limit),
      order: "created_at desc",
    });
    path = `/orders.json?${params}`;
  }

  const res = await shopifyAdminFetch(shopDomain, encryptedToken, path);
  if (!res.ok) {
    throw new Error(`Fetch orders failed: ${await res.text()}`);
  }

  const data = (await res.json()) as { orders: ShopifyOrder[] };
  const linkHeader = res.headers.get("link");
  const { next, previous } = parsePageInfoFromLink(linkHeader);

  return {
    orders: data.orders ?? [],
    nextPageInfo: next,
    previousPageInfo: previous,
  };
}
