import { createAdminClient } from "@/lib/supabase/admin";
import {
  getShopCurrency,
  searchProducts,
  shopifyAdminFetch,
} from "@/lib/shopify";
import {
  getStoreWhatsAppCredentials,
  getWhatsAppDisplayPhone,
} from "@/lib/whatsapp";
import {
  adLinkToProductContext,
  buildAdPrefillMessage,
  buildWhatsAppAdUrl,
  generateAdSlug,
  parseAdRefFromMessage,
} from "./whatsapp-ad-links";
import type {
  AdLinkProductSearchResult,
  AdProductContext,
  AdWhatsAppLink,
} from "./types";

async function getStoreWithIntegrations(storeId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("stores")
    .select(
      "id, shop_domain, shopify_access_token, whatsapp_phone_number_id, whatsapp_access_token"
    )
    .eq("id", storeId)
    .single();
  return data;
}

export async function searchAdProducts(
  storeId: string,
  query: string
): Promise<
  { products: AdLinkProductSearchResult[]; currency: string } | { error: string }
> {
  const store = await getStoreWithIntegrations(storeId);
  if (!store?.shop_domain || !store.shopify_access_token) {
    return { error: "Connect Shopify in Integrations first." };
  }

  let currency = "USD";
  try {
    currency =
      (await getShopCurrency(store.shop_domain, store.shopify_access_token)) ||
      "USD";
  } catch {
    currency = "USD";
  }

  const products = await searchProducts(
    store.shop_domain,
    store.shopify_access_token,
    query
  );

  return {
    currency,
    products: products.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      imageUrl: null,
      variants: p.variants.map((v) => ({
        id: v.id,
        title: v.title,
        price: v.price,
        in_stock: v.in_stock,
      })),
    })),
  };
}

export async function createAdWhatsAppLink(
  storeId: string,
  input: { productId: number; variantId?: number | null }
): Promise<AdWhatsAppLink | { error: string }> {
  const store = await getStoreWithIntegrations(storeId);
  if (!store?.shop_domain || !store.shopify_access_token) {
    return { error: "Connect Shopify in Integrations first." };
  }

  const waCreds = getStoreWhatsAppCredentials(store);
  if (!waCreds?.phoneNumberId) {
    return { error: "Connect WhatsApp in Integrations first." };
  }

  const displayPhone = await getWhatsAppDisplayPhone(
    waCreds.phoneNumberId,
    waCreds.accessToken
  );
  if (!displayPhone) {
    return {
      error:
        "Could not load your WhatsApp business number. Reconnect WhatsApp in Integrations.",
    };
  }

  const res = await shopifyAdminFetch(
    store.shop_domain,
    store.shopify_access_token,
    `/products/${input.productId}.json`
  );
  if (!res.ok) {
    return { error: "Product not found on Shopify." };
  }

  const data = (await res.json()) as {
    product: {
      id: number;
      title: string;
      body_html: string | null;
      variants: Array<{
        id: number;
        title: string;
        price: string;
      }>;
    };
  };

  const product = data.product;
  const variant =
    product.variants.find((v) => v.id === input.variantId) ??
    product.variants[0];

  if (!variant) {
    return { error: "Product has no variants." };
  }

  let currency: string | null = null;
  try {
    currency = await getShopCurrency(
      store.shop_domain,
      store.shopify_access_token
    );
  } catch {
    currency = null;
  }

  const description = product.body_html
    ? product.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500)
    : null;

  const supabase = createAdminClient();
  let slug = generateAdSlug();
  let attempts = 0;

  while (attempts < 5) {
    const prefillMessage = buildAdPrefillMessage(product.title, slug);
    const { data: row, error } = await supabase
      .from("ad_whatsapp_links")
      .insert({
        store_id: storeId,
        slug,
        shopify_product_id: String(product.id),
        shopify_variant_id: String(variant.id),
        product_title: product.title,
        product_description: description,
        variant_title: variant.title,
        price: variant.price,
        currency,
        prefill_message: prefillMessage,
      })
      .select("*")
      .single();

    if (!error && row) {
      const whatsapp_url = buildWhatsAppAdUrl(displayPhone, prefillMessage);
      return { ...(row as AdWhatsAppLink), whatsapp_url };
    }

    if (error?.message.includes("unique") || error?.code === "23505") {
      slug = generateAdSlug();
      attempts++;
      continue;
    }

    const hint = error?.message.includes("ad_whatsapp_links")
      ? " — Run migration 010_ad_whatsapp_links.sql in Supabase"
      : "";
    return { error: (error?.message ?? "Failed to create link") + hint };
  }

  return { error: "Could not generate a unique link. Try again." };
}

export async function listAdWhatsAppLinks(
  storeId: string
): Promise<AdWhatsAppLink[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ad_whatsapp_links")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(50);

  const links = (data ?? []) as AdWhatsAppLink[];
  const store = await getStoreWithIntegrations(storeId);
  const waCreds = store ? getStoreWhatsAppCredentials(store) : null;

  if (!waCreds?.phoneNumberId) return links;

  const displayPhone = await getWhatsAppDisplayPhone(
    waCreds.phoneNumberId,
    waCreds.accessToken
  );
  if (!displayPhone) return links;

  return links.map((link) => ({
    ...link,
    whatsapp_url: buildWhatsAppAdUrl(displayPhone, link.prefill_message),
  }));
}

export async function resolveAdLinkBySlug(
  storeId: string,
  slug: string
): Promise<AdWhatsAppLink | null> {
  const supabase = createAdminClient();
  const normalized = slug.toLowerCase();

  const { data } = await supabase
    .from("ad_whatsapp_links")
    .select("*")
    .eq("store_id", storeId)
    .eq("slug", normalized)
    .maybeSingle();

  if (data) return data as AdWhatsAppLink;

  // Portal products use SKU as the ad ref — also match product_sku
  const { data: bySku } = await supabase
    .from("ad_whatsapp_links")
    .select("*")
    .eq("store_id", storeId)
    .eq("product_sku", normalized)
    .maybeSingle();

  return (bySku as AdWhatsAppLink | null) ?? null;
}

export async function getAdLinkById(
  linkId: string
): Promise<AdWhatsAppLink | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ad_whatsapp_links")
    .select("*")
    .eq("id", linkId)
    .maybeSingle();

  return (data as AdWhatsAppLink | null) ?? null;
}

export async function recordAdLinkClick(linkId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ad_whatsapp_links")
    .select("click_count")
    .eq("id", linkId)
    .single();

  if (!data) return;

  await supabase
    .from("ad_whatsapp_links")
    .update({ click_count: (data.click_count as number) + 1 })
    .eq("id", linkId);
}

export async function resolveAdProductContext(
  storeId: string,
  options: {
    messageText?: string;
    conversationAdLinkId?: string | null;
  }
): Promise<AdProductContext | null> {
  if (options.messageText) {
    const slug = parseAdRefFromMessage(options.messageText);
    if (slug) {
      const link = await resolveAdLinkBySlug(storeId, slug);
      if (link) {
        await recordAdLinkClick(link.id);
        return adLinkToProductContext(link);
      }
    }
  }

  if (options.conversationAdLinkId) {
    const link = await getAdLinkById(options.conversationAdLinkId);
    if (link && link.store_id === storeId) {
      return adLinkToProductContext(link);
    }
  }

  return null;
}
