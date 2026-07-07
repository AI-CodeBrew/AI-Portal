import type { SupabaseClient } from "@supabase/supabase-js";
import { parseShopifyOrder, type ShopifyOrder } from "@/lib/shopify";

export async function upsertShopifyOrder(
  supabase: SupabaseClient,
  storeId: string,
  order: ShopifyOrder
): Promise<void> {
  const parsed = parseShopifyOrder(order);

  let customerId: string | null = null;
  if (parsed.phone) {
    const { data: customer } = await supabase
      .from("customers")
      .upsert(
        {
          store_id: storeId,
          phone: parsed.phone,
          name: parsed.name,
          shopify_customer_id: parsed.shopifyCustomerId,
        },
        { onConflict: "store_id,phone" }
      )
      .select("id")
      .single();
    customerId = customer?.id ?? null;
  }

  const { data: existing } = await supabase
    .from("orders")
    .select("id, status")
    .eq("store_id", storeId)
    .eq("shopify_order_id", String(order.id))
    .maybeSingle();

  const shopifyCreatedAt = order.created_at ?? new Date().toISOString();

  if (existing) {
    await supabase
      .from("orders")
      .update({
        items: parsed.items,
        total: parsed.total,
        order_number: parsed.orderNumber,
        customer_id: customerId,
        currency: parsed.currency,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("orders").insert({
      store_id: storeId,
      customer_id: customerId,
      shopify_order_id: String(order.id),
      order_number: parsed.orderNumber,
      items: parsed.items,
      total: parsed.total,
      currency: parsed.currency,
      status: "pending",
      source: "shopify",
      created_at: shopifyCreatedAt,
    });
  }
}
