import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-shop-domain, x-shopify-topic",
};

function verifyHmac(body: string, hmac: string, secret: string): boolean {
  const key = new TextEncoder().encode(secret);
  const encoder = new TextEncoder();
  // Use Web Crypto for edge runtime
  return false; // Verified in Next.js route as primary; edge uses service role
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const hmac = req.headers.get("X-Shopify-Hmac-Sha256") ?? "";
  const secret = Deno.env.get("SHOPIFY_API_SECRET") ?? "";
  const shopDomain = req.headers.get("X-Shopify-Shop-Domain");

  // HMAC verification using crypto subtle
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));

  if (computed !== hmac) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const order = JSON.parse(rawBody);
  const topic = req.headers.get("X-Shopify-Topic");

  if (!topic?.startsWith("orders/") || !shopDomain) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("shop_domain", shopDomain)
    .single();

  if (!store) {
    return new Response(JSON.stringify({ error: "Store not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const phone =
    order.phone || order.customer?.phone || null;
  const name = order.customer
    ? [order.customer.first_name, order.customer.last_name]
        .filter(Boolean)
        .join(" ") || null
    : null;

  let customerId: string | null = null;
  if (phone) {
    const { data: customer } = await supabase
      .from("customers")
      .upsert(
        {
          store_id: store.id,
          phone,
          name,
          shopify_customer_id: order.customer?.id
            ? String(order.customer.id)
            : null,
        },
        { onConflict: "store_id,phone" }
      )
      .select("id")
      .single();
    customerId = customer?.id ?? null;
  }

  const items = (order.line_items ?? []).map(
    (li: {
      title: string;
      quantity: number;
      price: string;
      variant_id: number;
      product_id: number;
    }) => ({
      title: li.title,
      quantity: li.quantity,
      price: parseFloat(li.price),
      variant_id: String(li.variant_id),
      product_id: String(li.product_id),
    })
  );

  const orderNumber = order.name || `#${order.order_number}`;
  const total = parseFloat(order.total_price);

  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("store_id", store.id)
    .eq("shopify_order_id", String(order.id))
    .maybeSingle();

  if (existing) {
    await supabase
      .from("orders")
      .update({ items, total, order_number: orderNumber, customer_id: customerId })
      .eq("id", existing.id);
  } else {
    await supabase.from("orders").insert({
      store_id: store.id,
      customer_id: customerId,
      shopify_order_id: String(order.id),
      order_number: orderNumber,
      items,
      total,
      status: "pending",
      source: "shopify",
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
