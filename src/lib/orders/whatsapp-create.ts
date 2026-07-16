import { createAdminClient } from "@/lib/supabase/admin";
import { createDraftOrder } from "@/lib/shopify";
import { confirmPortalOrder } from "@/lib/orders/confirm";
import {
  getStoreProduct,
  getStoreProductBySku,
  extractSkuFromText,
} from "@/lib/products/products-service";
import { toWhatsAppRecipient } from "@/lib/whatsapp";
import { formatMoney } from "@/lib/currency";
import type { Store } from "@/lib/types";
import type { StoreProduct } from "@/lib/products/types";

export type WhatsAppOrderLineInput = {
  variant_id?: string;
  product_id?: string;
  sku?: string;
  quantity?: number;
  source?: string;
};

export type WhatsAppOrderShipping = {
  customer_name: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  country?: string;
  zip?: string;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isShopifyVariantId(value: string): boolean {
  return /^\d{5,}$/.test(value.trim());
}

async function findPortalVariantRow(
  storeId: string,
  variantId: string
): Promise<{
  product: StoreProduct;
  variant: NonNullable<StoreProduct["variants"]>[number] | null;
} | null> {
  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("store_product_variants")
    .select("id, product_id, title, sku, price, option_values")
    .eq("store_id", storeId)
    .eq("id", variantId)
    .maybeSingle();

  if (!row?.product_id) return null;
  const product = await getStoreProduct(storeId, row.product_id);
  if (!product) return null;
  const variant =
    product.variants?.find((v) => v.id === row.id) ??
    ({
      id: row.id,
      product_id: row.product_id,
      store_id: storeId,
      title: row.title,
      sku: row.sku,
      price: row.price,
      option_values: (row.option_values ?? {}) as Record<string, string>,
      sort_order: 0,
    } as NonNullable<StoreProduct["variants"]>[number]);
  return { product, variant };
}

async function resolveShopifySkuRegistry(
  storeId: string,
  sku: string
): Promise<{ variant_id: string; product_id: string; title: string } | null> {
  const supabase = createAdminClient();
  const candidates = Array.from(
    new Set(
      [
        extractSkuFromText(sku),
        sku.trim().toUpperCase(),
        sku.trim(),
      ].filter((s): s is string => Boolean(s && s.length >= 4))
    )
  );

  for (const candidate of candidates) {
    const { data } = await supabase
      .from("shopify_product_skus")
      .select("sku, product_title, shopify_product_id, shopify_variant_id")
      .eq("store_id", storeId)
      .ilike("sku", candidate)
      .maybeSingle();

    const variantId = String(data?.shopify_variant_id ?? "").trim();
    if (variantId && isShopifyVariantId(variantId)) {
      return {
        variant_id: variantId,
        product_id: String(data?.shopify_product_id ?? ""),
        title: String(data?.product_title || data?.sku || candidate),
      };
    }
  }
  return null;
}

async function resolvePortalLine(
  storeId: string,
  line: WhatsAppOrderLineInput
): Promise<{
  title: string;
  quantity: number;
  price: number;
  variant_id: string;
  product_id: string;
  sku: string | null;
} | null> {
  const qty = Math.max(1, Number(line.quantity) || 1);
  const variantId = String(line.variant_id ?? "").trim();
  const productId = String(line.product_id ?? "").trim();
  const sku = String(line.sku ?? "").trim() || extractSkuFromText(variantId);

  if (variantId && isUuid(variantId)) {
    const asVariant = await findPortalVariantRow(storeId, variantId);
    if (asVariant) {
      const price = Number(
        asVariant.variant?.price ?? asVariant.product.price ?? 0
      );
      return {
        title:
          asVariant.variant?.title && asVariant.variant.title !== "Default"
            ? `${asVariant.product.name} (${asVariant.variant.title})`
            : asVariant.product.name,
        quantity: qty,
        price,
        variant_id: asVariant.variant?.id ?? asVariant.product.id,
        product_id: asVariant.product.id,
        sku: asVariant.variant?.sku ?? asVariant.product.sku,
      };
    }

    const asProduct = await getStoreProduct(storeId, variantId);
    if (asProduct) {
      const v = asProduct.variants?.[0] ?? null;
      return {
        title: asProduct.name,
        quantity: qty,
        price: Number(v?.price ?? asProduct.price),
        variant_id: v?.id ?? asProduct.id,
        product_id: asProduct.id,
        sku: v?.sku ?? asProduct.sku,
      };
    }
  }

  if (productId && isUuid(productId)) {
    const product = await getStoreProduct(storeId, productId);
    if (product) {
      const v =
        (variantId &&
          product.variants?.find((x) => x.id === variantId)) ||
        product.variants?.[0] ||
        null;
      return {
        title:
          v?.title && v.title !== "Default"
            ? `${product.name} (${v.title})`
            : product.name,
        quantity: qty,
        price: Number(v?.price ?? product.price),
        variant_id: v?.id ?? product.id,
        product_id: product.id,
        sku: v?.sku ?? product.sku,
      };
    }
  }

  if (sku) {
    const product = await getStoreProductBySku(storeId, sku);
    if (product) {
      const v = product.variants?.[0] ?? null;
      return {
        title: product.name,
        quantity: qty,
        price: Number(v?.price ?? product.price),
        variant_id: v?.id ?? product.id,
        product_id: product.id,
        sku: product.sku,
      };
    }
  }

  return null;
}

function nextPortalOrderNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  return `#P${stamp}`;
}

export async function createWhatsAppAiOrder(params: {
  store: Store;
  conversationCustomerId?: string | null;
  /** WhatsApp chat number the customer is messaging from */
  conversationPhone?: string | null;
  lineItems: WhatsAppOrderLineInput[];
  shipping: WhatsAppOrderShipping;
  discountPercent?: number;
  recoveryDealType?: "discount" | "bundle" | null;
  storeCurrency?: string | null;
}): Promise<
  | {
      ok: true;
      order_id: string;
      order_number: string;
      total: number;
      currency: string;
      total_formatted: string;
      confirmed: boolean;
      confirm_error?: string;
      whatsapp_sent?: boolean;
      whatsapp_error?: string;
      source: "portal" | "shopify" | "mixed";
      message: string;
    }
  | { ok: false; error: string }
> {
  const { store, shipping } = params;
  const phoneForOrder = toWhatsAppRecipient(
    shipping.phone,
    params.conversationPhone
  );
  if (!phoneForOrder || phoneForOrder.length < 10) {
    return {
      ok: false,
      error: "A valid customer phone number is required to place the order.",
    };
  }
  if (!shipping.address1.trim()) {
    return {
      ok: false,
      error: "Delivery address is required to place the order.",
    };
  }

  const customerName = shipping.customer_name.trim() || "Customer";

  const city = shipping.city.trim() || "N/A";
  const supabase = createAdminClient();
  const shopifyConnected = Boolean(
    store.shop_domain && store.shopify_access_token
  );

  const portalLines: Array<{
    title: string;
    quantity: number;
    price: number;
    variant_id: string;
    product_id: string;
    sku: string | null;
  }> = [];
  const shopifyLines: Array<{ variant_id: string; quantity: number }> = [];

  for (const line of params.lineItems) {
    const sourceHint = String(line.source ?? "").toLowerCase();
    let variantId = String(line.variant_id ?? "").trim();
    const skuHint = String(line.sku ?? "").trim();

    // Prefer portal when UUID / SKU / explicit portal source
    if (
      sourceHint === "portal" ||
      isUuid(variantId) ||
      isUuid(String(line.product_id ?? "")) ||
      skuHint ||
      !isShopifyVariantId(variantId)
    ) {
      const resolved = await resolvePortalLine(store.id, line);
      if (resolved) {
        portalLines.push(resolved);
        continue;
      }
    }

    // Shopify SKU registry (portal catalog miss, e.g. AA-… mapped to Shopify)
    if (skuHint && shopifyConnected && !isShopifyVariantId(variantId)) {
      const registry = await resolveShopifySkuRegistry(store.id, skuHint);
      if (registry) {
        variantId = registry.variant_id;
      }
    }

    if (isShopifyVariantId(variantId) && shopifyConnected) {
      shopifyLines.push({
        variant_id: variantId,
        quantity: Math.max(1, Number(line.quantity) || 1),
      });
      continue;
    }

    // Last resort: portal by SKU embedded in variant_id text
    const resolved = await resolvePortalLine(store.id, line);
    if (resolved) {
      portalLines.push(resolved);
      continue;
    }

    if (isShopifyVariantId(variantId)) {
      if (!shopifyConnected) {
        return {
          ok: false,
          error:
            "Shopify is not connected, so this Shopify variant cannot be ordered. Ask the customer to choose a portal catalog product, or connect Shopify.",
        };
      }
      shopifyLines.push({
        variant_id: variantId,
        quantity: Math.max(1, Number(line.quantity) || 1),
      });
      continue;
    }

    return {
      ok: false,
      error: `Could not resolve product/variant for line item (${variantId || skuHint || "unknown"}). Search the product again and use the returned variant id or SKU.`,
    };
  }

  if (!portalLines.length && !shopifyLines.length) {
    return { ok: false, error: "At least one line item is required." };
  }

  // Upsert customer on the phone the customer shared (confirmation goes here)
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

  const custId = cust?.id ?? params.conversationCustomerId ?? null;

  const portalShipping = {
    name: customerName,
    phone: phoneForOrder,
    address1: shipping.address1.trim(),
    address2: shipping.address2?.trim() || undefined,
    city,
    province: shipping.province?.trim() || undefined,
    country: shipping.country?.trim() || undefined,
    zip: shipping.zip?.trim() || undefined,
  };

  let orderId: string | null = null;
  let orderNumber: string;
  let total: number;
  let currency: string;
  let items: Array<{
    title: string;
    quantity: number;
    price: number;
    variant_id?: string;
    product_id?: string;
  }>;
  let source: "portal" | "shopify" | "mixed" = "portal";

  const recoveryFields = {
    ...(params.recoveryDealType
      ? { recovery_deal_type: params.recoveryDealType }
      : {}),
    ...(params.discountPercent != null && params.discountPercent > 0
      ? { recovery_discount_percent: params.discountPercent }
      : {}),
  };

  if (shopifyLines.length > 0 && portalLines.length === 0) {
    source = "shopify";
    const draft = await createDraftOrder(
      store.shop_domain!,
      store.shopify_access_token!,
      {
        phone: phoneForOrder,
        name: customerName,
        lineItems: shopifyLines,
        discountPercent: params.discountPercent,
        shippingAddress: {
          address1: portalShipping.address1,
          address2: portalShipping.address2,
          city: portalShipping.city,
          province: portalShipping.province,
          country: portalShipping.country,
          zip: portalShipping.zip,
        },
      }
    );

    orderNumber = draft.order_number;
    total = draft.total;
    currency = (draft.currency || params.storeCurrency || "USD").toUpperCase();
    items = draft.items;

    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        store_id: store.id,
        customer_id: custId,
        shopify_draft_order_id: draft.draft_order_id,
        order_number: orderNumber,
        items,
        total,
        currency,
        status: "pending",
        source: "whatsapp_ai",
        shipping_address: portalShipping,
        shopify_sync_status: "synced",
        ...recoveryFields,
      })
      .select("id")
      .single();

    if (error || !order) {
      return {
        ok: false,
        error: error?.message || "Failed to save Shopify order in portal",
      };
    }
    orderId = order.id;
  } else {
    // Portal-only (or portal preferred). Ignore unresolved shopify mix for now.
    source = shopifyLines.length > 0 ? "mixed" : "portal";
    items = portalLines.map((l) => ({
      title: l.title,
      quantity: l.quantity,
      price: l.price,
      variant_id: l.variant_id,
      product_id: l.product_id,
    }));

    let subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const discount =
      params.discountPercent != null &&
      params.discountPercent > 0 &&
      params.discountPercent <= 90
        ? params.discountPercent
        : 0;
    if (discount > 0) {
      subtotal = Math.round(subtotal * (1 - discount / 100) * 100) / 100;
    }

    total = subtotal;
    currency = (
      (await getStoreProduct(store.id, portalLines[0].product_id))?.currency ||
      params.storeCurrency ||
      "PKR"
    ).toUpperCase();
    orderNumber = nextPortalOrderNumber();

    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        store_id: store.id,
        customer_id: custId,
        order_number: orderNumber,
        items,
        total,
        currency,
        status: "pending",
        source: "whatsapp_ai",
        shipping_address: portalShipping,
        shopify_sync_status: "not_applicable",
        ...recoveryFields,
      })
      .select("id")
      .single();

    if (error || !order) {
      return {
        ok: false,
        error: error?.message || "Failed to create portal order",
      };
    }
    orderId = order.id;
  }

  const confirmResult = await confirmPortalOrder(orderId!, {
    email: "whatsapp-ai@system",
    role: "system",
    storeId: store.id,
  }, {
    conversationPhone: params.conversationPhone ?? phoneForOrder,
  });

  let confirmed = false;
  let confirmError: string | undefined;
  let whatsappSent: boolean | undefined;
  let whatsappError: string | undefined;

  if ("error" in confirmResult) {
    confirmError = confirmResult.error;
  } else {
    confirmed = true;
    whatsappSent = confirmResult.whatsapp_sent;
    whatsappError = confirmResult.whatsapp_error;
  }

  return {
    ok: true,
    order_id: orderId!,
    order_number: orderNumber,
    total,
    currency,
    total_formatted: formatMoney(total, currency),
    confirmed,
    confirm_error: confirmError,
    whatsapp_sent: whatsappSent,
    whatsapp_error: whatsappError,
    source,
    message: confirmed
      ? `Order ${orderNumber} created and confirmed (${source}). Confirmation WhatsApp ${whatsappSent ? "sent" : "not sent"} to ${phoneForOrder}. Tell the customer their order is confirmed and being prepared for dispatch.`
      : `Order ${orderNumber} created but confirmation had an issue (${confirmError ?? "unknown"}). Tell the customer a team member will finalize shortly.`,
  };
}
