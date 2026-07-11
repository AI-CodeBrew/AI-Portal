import { createAdminClient } from "@/lib/supabase/admin";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Globally unique portal SKU, unique across all resellers. */
export function generateCandidateSku(prefix = "AA"): string {
  let body = "";
  for (let i = 0; i < 10; i++) {
    body += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `${prefix}-${body}`;
}

export async function allocateUniqueProductSku(
  preferred?: string | null
): Promise<string> {
  const supabase = createAdminClient();
  const candidates: string[] = [];

  if (preferred?.trim()) {
    candidates.push(
      preferred
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-_]+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 48)
    );
  }

  for (let i = 0; i < 8; i++) {
    candidates.push(generateCandidateSku());
  }

  for (const sku of candidates) {
    if (!sku) continue;
    const { data: portal } = await supabase
      .from("store_products")
      .select("id")
      .ilike("sku", sku)
      .maybeSingle();
    if (portal) continue;

    const { data: shopify } = await supabase
      .from("shopify_product_skus")
      .select("id")
      .ilike("sku", sku)
      .maybeSingle();
    if (shopify) continue;

    return sku;
  }

  return generateCandidateSku(`AA${Date.now().toString(36).toUpperCase()}`);
}

export async function ensureShopifyProductSku(input: {
  storeId: string;
  shopifyProductId: string | number;
  shopifyVariantId?: string | number | null;
  productTitle?: string | null;
}): Promise<{ sku: string; created: boolean } | { error: string }> {
  const supabase = createAdminClient();
  const productId = String(input.shopifyProductId);

  const { data: existing } = await supabase
    .from("shopify_product_skus")
    .select("sku")
    .eq("store_id", input.storeId)
    .eq("shopify_product_id", productId)
    .maybeSingle();

  if (existing?.sku) {
    return { sku: existing.sku as string, created: false };
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const sku = await allocateUniqueProductSku();
    const { data, error } = await supabase
      .from("shopify_product_skus")
      .insert({
        store_id: input.storeId,
        shopify_product_id: productId,
        shopify_variant_id: input.shopifyVariantId
          ? String(input.shopifyVariantId)
          : null,
        sku,
        product_title: input.productTitle ?? null,
      })
      .select("sku")
      .single();

    if (!error && data) {
      return { sku: data.sku as string, created: true };
    }
    if (error && !error.message.includes("unique") && error.code !== "23505") {
      const hint = error.message.includes("shopify_product_skus")
        ? " — Run migration 019_feature_pack.sql in Supabase"
        : "";
      return { error: error.message + hint };
    }
  }

  return { error: "Could not allocate a unique SKU. Try again." };
}

export async function resolveProductByGlobalSku(
  sku: string
): Promise<{
  source: "portal" | "shopify";
  storeId: string;
  title: string | null;
  sku: string;
  portalProductId?: string;
  shopifyProductId?: string;
} | null> {
  const supabase = createAdminClient();
  const normalized = sku.trim();
  if (!normalized) return null;

  const { data: portal } = await supabase
    .from("store_products")
    .select("id, store_id, name, sku")
    .ilike("sku", normalized)
    .maybeSingle();

  if (portal) {
    return {
      source: "portal",
      storeId: portal.store_id as string,
      title: portal.name as string,
      sku: portal.sku as string,
      portalProductId: portal.id as string,
    };
  }

  const { data: shopify } = await supabase
    .from("shopify_product_skus")
    .select("store_id, product_title, sku, shopify_product_id")
    .ilike("sku", normalized)
    .maybeSingle();

  if (shopify) {
    return {
      source: "shopify",
      storeId: shopify.store_id as string,
      title: (shopify.product_title as string | null) ?? null,
      sku: shopify.sku as string,
      shopifyProductId: shopify.shopify_product_id as string,
    };
  }

  return null;
}
