import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStoreWhatsAppCredentials,
  getWhatsAppDisplayPhone,
} from "@/lib/whatsapp";
import {
  buildAdPrefillMessage,
  buildWhatsAppAdUrl,
} from "@/lib/ads/whatsapp-ad-links";
import { allocateUniqueProductSku } from "./global-sku";
import type {
  ProductInput,
  StoreProduct,
  StoreProductBundle,
  StoreProductOption,
  StoreProductVariant,
} from "./types";

function normalizeSku(sku: string): string {
  return sku
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/** Best public HTTPS image URL for WhatsApp / catalog display. */
export function getPrimaryProductImageUrl(product: {
  image_url?: string | null;
  image_urls?: string[] | null;
  imageUrl?: string | null;
}): string | null {
  const candidates = [
    product.imageUrl,
    product.image_url,
    ...(product.image_urls ?? []),
  ];

  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    let u = raw.trim();
    if (!u) continue;
    if (u.startsWith("//")) u = `https:${u}`;
    if (u.startsWith("http://")) u = `https://${u.slice(7)}`;
    if (u.startsWith("https://")) return u;
    const cdn = process.env.BUNNY_CDN_HOSTNAME?.replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    if (cdn) {
      return `https://${cdn}/${u.replace(/^\//, "")}`;
    }
  }
  return null;
}

/** Pull SKU-like codes from free text (e.g. "AA-6CH6DZ33WZ\\ntell me about this"). */
export function extractSkuFromText(text: string): string | null {
  const t = text
    .trim()
    // Strip URLs / domains so "ai-portal-silk.vercel.app" is not read as SKU "AI-PORTAL"
    .replace(/https?:\/\/[^\s]+/gi, " ")
    .replace(
      /\b[a-z0-9][a-z0-9-]*\.(?:vercel\.app|myshopify\.com|co\.uk|com|net|org|io)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  const portal = t.match(/\b(AA-[A-Z0-9]{6,})\b/i);
  if (portal?.[1]) return normalizeSku(portal[1]);
  const generic = t.match(/\b([A-Z]{1,5}-[A-Z0-9]{4,32})\b/i);
  if (generic?.[1]) {
    const sku = normalizeSku(generic[1]);
    // Project / host false positives
    if (sku === "AI-PORTAL") return null;
    return sku;
  }
  // Standalone token — require digit/dash/underscore so "heyyy", "hello", "storage" aren't SKUs
  if (/^[A-Z0-9][A-Z0-9_-]{3,47}$/i.test(t) && /\d|[-_]/.test(t)) {
    return normalizeSku(t);
  }
  return null;
}

function escapeIlike(value: string): string {
  return value
    .replace(/[%_,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalizeImages(input: ProductInput): {
  image_url: string | null;
  image_urls: string[];
} {
  const urls = (input.image_urls ?? [])
    .map((u) => u.trim())
    .filter(Boolean);
  const thumb =
    (input.image_url?.trim() && urls.includes(input.image_url.trim())
      ? input.image_url.trim()
      : null) ??
    urls[0] ??
    input.image_url?.trim() ??
    null;

  const ordered =
    thumb && urls.includes(thumb)
      ? [thumb, ...urls.filter((u) => u !== thumb)]
      : thumb
        ? [thumb, ...urls]
        : urls;

  return {
    image_url: thumb,
    image_urls: ordered,
  };
}

function cartesianVariants(
  options: Array<{ name: string; values: string[] }>
): Array<{ title: string; option_values: Record<string, string> }> {
  const cleaned = options
    .map((o) => ({
      name: o.name.trim(),
      values: o.values.map((v) => v.trim()).filter(Boolean),
    }))
    .filter((o) => o.name && o.values.length > 0);

  if (cleaned.length === 0) return [];

  let combos: Array<Record<string, string>> = [{}];
  for (const opt of cleaned) {
    const next: Array<Record<string, string>> = [];
    for (const combo of combos) {
      for (const value of opt.values) {
        next.push({ ...combo, [opt.name]: value });
      }
    }
    combos = next;
  }

  return combos.map((option_values) => ({
    option_values,
    title: cleaned.map((o) => option_values[o.name]).join(" / "),
  }));
}

async function attachRelations(
  storeId: string,
  products: StoreProduct[]
): Promise<StoreProduct[]> {
  if (products.length === 0) return [];

  const supabase = createAdminClient();
  const ids = products.map((p) => p.id);

  const [optionsRes, variantsRes, bundlesRes, linksRes] = await Promise.all([
    supabase
      .from("store_product_options")
      .select("*")
      .eq("store_id", storeId)
      .in("product_id", ids)
      .order("sort_order"),
    supabase
      .from("store_product_variants")
      .select("*")
      .eq("store_id", storeId)
      .in("product_id", ids)
      .order("sort_order"),
    supabase
      .from("store_product_bundles")
      .select("*")
      .eq("store_id", storeId)
      .in("product_id", ids)
      .order("sort_order"),
    supabase
      .from("ad_whatsapp_links")
      .select("id, slug, click_count, portal_product_id, prefill_message")
      .eq("store_id", storeId)
      .in("portal_product_id", ids),
  ]);

  const optionsByProduct = new Map<string, StoreProductOption[]>();
  for (const row of optionsRes.data ?? []) {
    const list = optionsByProduct.get(row.product_id) ?? [];
    list.push(row as StoreProductOption);
    optionsByProduct.set(row.product_id, list);
  }

  const variantsByProduct = new Map<string, StoreProductVariant[]>();
  for (const row of variantsRes.data ?? []) {
    const list = variantsByProduct.get(row.product_id) ?? [];
    list.push({
      ...(row as StoreProductVariant),
      option_values: (row.option_values ?? {}) as Record<string, string>,
    });
    variantsByProduct.set(row.product_id, list);
  }

  const bundlesByProduct = new Map<string, StoreProductBundle[]>();
  for (const row of bundlesRes.data ?? []) {
    const list = bundlesByProduct.get(row.product_id) ?? [];
    list.push(row as StoreProductBundle);
    bundlesByProduct.set(row.product_id, list);
  }

  const linkByProduct = new Map<
    string,
    { id: string; slug: string; click_count: number; prefill_message: string }
  >();
  for (const row of linksRes.data ?? []) {
    if (row.portal_product_id) {
      linkByProduct.set(row.portal_product_id, {
        id: row.id,
        slug: row.slug,
        click_count: row.click_count,
        prefill_message: row.prefill_message,
      });
    }
  }

  let displayPhone: string | null = null;
  const { data: store } = await supabase
    .from("stores")
    .select("whatsapp_phone_number_id, whatsapp_access_token")
    .eq("id", storeId)
    .single();

  const waCreds = store ? getStoreWhatsAppCredentials(store) : null;
  if (waCreds?.phoneNumberId) {
    displayPhone = await getWhatsAppDisplayPhone(
      waCreds.phoneNumberId,
      waCreds.accessToken
    );
  }

  return products.map((p) => {
    const link = linkByProduct.get(p.id);
    return {
      ...p,
      options: optionsByProduct.get(p.id) ?? [],
      variants: variantsByProduct.get(p.id) ?? [],
      bundles: bundlesByProduct.get(p.id) ?? [],
      ad_link: link
        ? {
            id: link.id,
            slug: link.slug,
            click_count: link.click_count,
            whatsapp_url: displayPhone
              ? buildWhatsAppAdUrl(displayPhone, link.prefill_message)
              : undefined,
          }
        : null,
    };
  });
}

export async function listStoreProducts(
  storeId: string
): Promise<{ products: StoreProduct[]; error?: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_products")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  if (error) {
    const hint = error.message.includes("store_products")
      ? " — Run migration 011_store_products.sql in Supabase"
      : "";
    return { products: [], error: error.message + hint };
  }

  const products = await attachRelations(
    storeId,
    (data ?? []).map((row) => ({
      ...(row as StoreProduct),
      image_urls: Array.isArray(row.image_urls)
        ? (row.image_urls as string[])
        : row.image_url
          ? [row.image_url as string]
          : [],
    }))
  );
  return { products };
}

function normalizeProductRow(row: Record<string, unknown>): StoreProduct {
  let image_url = (row.image_url as string | null) ?? null;
  const image_urls = Array.isArray(row.image_urls)
    ? (row.image_urls as string[]).filter(Boolean)
    : image_url
      ? [image_url]
      : [];
  if (!image_url && image_urls.length > 0) {
    image_url = image_urls[0];
  }
  return { ...(row as unknown as StoreProduct), image_url, image_urls };
}

export async function getStoreProduct(
  storeId: string,
  productId: string
): Promise<StoreProduct | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("store_products")
    .select("*")
    .eq("store_id", storeId)
    .eq("id", productId)
    .maybeSingle();

  if (!data) return null;
  const [product] = await attachRelations(storeId, [
    normalizeProductRow(data as Record<string, unknown>),
  ]);
  return product ?? null;
}

export async function getStoreProductBySku(
  storeId: string,
  sku: string
): Promise<StoreProduct | null> {
  const supabase = createAdminClient();
  const candidates = Array.from(
    new Set(
      [
        extractSkuFromText(sku),
        normalizeSku(sku),
        sku.trim().toUpperCase(),
      ].filter((s): s is string => Boolean(s && s.length >= 4))
    )
  );

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from("store_products")
      .select("*")
      .eq("store_id", storeId)
      .ilike("sku", candidate)
      .maybeSingle();

    if (error) {
      console.error("[getStoreProductBySku]", error.message);
      continue;
    }
    if (!data) continue;

    const [product] = await attachRelations(storeId, [
      normalizeProductRow(data as Record<string, unknown>),
    ]);
    if (product) return product;
  }

  return null;
}

async function replaceChildren(
  storeId: string,
  productId: string,
  input: ProductInput
) {
  const supabase = createAdminClient();

  await Promise.all([
    supabase.from("store_product_options").delete().eq("product_id", productId),
    supabase.from("store_product_variants").delete().eq("product_id", productId),
    supabase.from("store_product_bundles").delete().eq("product_id", productId),
  ]);

  const options = input.options ?? [];
  if (options.length > 0) {
    await supabase.from("store_product_options").insert(
      options.map((o, i) => ({
        product_id: productId,
        store_id: storeId,
        name: o.name.trim(),
        values: o.values.map((v) => v.trim()).filter(Boolean),
        sort_order: i,
      }))
    );
  }

  const autoVariants = cartesianVariants(options);
  const variants =
    input.variants && input.variants.length > 0
      ? input.variants
      : autoVariants.map((v) => ({
          title: v.title,
          sku: null,
          price: null,
          option_values: v.option_values,
        }));

  if (variants.length > 0) {
    await supabase.from("store_product_variants").insert(
      variants.map((v, i) => ({
        product_id: productId,
        store_id: storeId,
        title: v.title,
        sku: v.sku ? normalizeSku(v.sku) : null,
        price: v.price ?? null,
        option_values: v.option_values ?? {},
        sort_order: i,
      }))
    );
  }

  const bundles = (input.bundles ?? []).filter((b) => b.quantity > 0);
  if (bundles.length > 0) {
    await supabase.from("store_product_bundles").insert(
      bundles.map((b, i) => ({
        product_id: productId,
        store_id: storeId,
        quantity: b.quantity,
        price: b.price,
        label: b.label ?? null,
        sort_order: i,
      }))
    );
  }
}

export async function createStoreProduct(
  storeId: string,
  input: ProductInput
): Promise<{ product: StoreProduct; whatsapp_url?: string } | { error: string }> {
  const sku = await allocateUniqueProductSku(input.sku || input.name);
  if (!input.name.trim()) return { error: "Product name is required." };
  if (input.price < 0) return { error: "Price must be 0 or greater." };

  const images = normalizeImages(input);
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from("store_products")
    .insert({
      store_id: storeId,
      name: input.name.trim(),
      tagline: input.tagline?.trim() || null,
      description: input.description?.trim() || null,
      image_url: images.image_url,
      image_urls: images.image_urls,
      price: input.price,
      currency: input.currency || "AED",
      target_country: input.target_country || "UAE",
      sku,
      discount_enabled: Boolean(input.discount_enabled),
      discount_type: input.discount_enabled ? input.discount_type ?? null : null,
      discount_value: input.discount_enabled ? input.discount_value ?? null : null,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !row) {
    if (error?.code === "23505") {
      return { error: "A product with this SKU already exists globally. Try again." };
    }
    const hint = error?.message.includes("store_products")
      ? " — Run migration 011_store_products.sql in Supabase"
      : "";
    return { error: (error?.message ?? "Failed to create product") + hint };
  }

  await replaceChildren(storeId, row.id, input);

  const product = await getStoreProduct(storeId, row.id);
  if (!product) return { error: "Product created but could not reload." };

  return { product };
}

export async function updateStoreProduct(
  storeId: string,
  productId: string,
  input: ProductInput
): Promise<{ product: StoreProduct; whatsapp_url?: string } | { error: string }> {
  const existing = await getStoreProduct(storeId, productId);
  if (!existing) return { error: "Product not found" };
  const sku =
    existing.sku ||
    (await allocateUniqueProductSku(input.sku || input.name));
  if (!input.name.trim()) return { error: "Product name is required." };

  const images = normalizeImages(input);
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from("store_products")
    .update({
      name: input.name.trim(),
      tagline: input.tagline?.trim() || null,
      description: input.description?.trim() || null,
      image_url: images.image_url,
      image_urls: images.image_urls,
      price: input.price,
      currency: input.currency || existing.currency || "AED",
      target_country: input.target_country || existing.target_country || "UAE",
      sku,
      discount_enabled: Boolean(input.discount_enabled),
      discount_type: input.discount_enabled ? input.discount_type ?? null : null,
      discount_value: input.discount_enabled ? input.discount_value ?? null : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .eq("store_id", storeId)
    .select("*")
    .single();

  if (error || !row) {
    if (error?.code === "23505") {
      return { error: "SKU conflict with another product." };
    }
    return { error: error?.message ?? "Failed to update product" };
  }

  await replaceChildren(storeId, productId, input);
  const product = await getStoreProduct(storeId, productId);
  if (!product) return { error: "Product updated but could not reload." };

  return { product };
}

export async function deleteStoreProduct(
  storeId: string,
  productId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("store_products")
    .delete()
    .eq("id", productId)
    .eq("store_id", storeId);

  if (error) return { error: error.message };
  return { ok: true };
}

export async function ensureProductAdLink(
  storeId: string,
  productId: string
): Promise<{ whatsapp_url: string; slug: string } | { error: string }> {
  const product = await getStoreProduct(storeId, productId);
  if (!product) return { error: "Product not found." };

  const supabase = createAdminClient();
  const { data: store } = await supabase
    .from("stores")
    .select("whatsapp_phone_number_id, whatsapp_access_token")
    .eq("id", storeId)
    .single();

  const waCreds = store ? getStoreWhatsAppCredentials(store) : null;
  if (!waCreds?.phoneNumberId) {
    return { error: "Connect WhatsApp in Integrations to generate ad links." };
  }

  const displayPhone = await getWhatsAppDisplayPhone(
    waCreds.phoneNumberId,
    waCreds.accessToken
  );
  if (!displayPhone) {
    return {
      error:
        "Could not load your WhatsApp business number. Reconnect WhatsApp.",
    };
  }

  const slug = product.sku;
  const prefillMessage = buildAdPrefillMessage(product.name, slug);
  const defaultVariant = product.variants?.[0] ?? null;

  const { data: existing } = await supabase
    .from("ad_whatsapp_links")
    .select("id")
    .eq("store_id", storeId)
    .eq("portal_product_id", productId)
    .maybeSingle();

  const payload = {
    store_id: storeId,
    slug,
    shopify_product_id: null,
    shopify_variant_id: null,
    portal_product_id: productId,
    portal_variant_id: defaultVariant?.id ?? null,
    product_sku: product.sku,
    product_title: product.name,
    product_description:
      product.description || product.tagline || null,
    variant_title: defaultVariant?.title ?? null,
    price: String(defaultVariant?.price ?? product.price),
    currency: product.currency,
    image_url: product.image_url,
    prefill_message: prefillMessage,
  };

  if (existing) {
    const { error } = await supabase
      .from("ad_whatsapp_links")
      .update(payload)
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("ad_whatsapp_links").insert(payload);
    if (error) {
      if (error.code === "23505") {
        // Slug taken by another link — update that row if it's this product's SKU
        const { error: upsertErr } = await supabase
          .from("ad_whatsapp_links")
          .upsert(payload, { onConflict: "store_id,slug" });
        if (upsertErr) return { error: upsertErr.message };
      } else {
        return { error: error.message };
      }
    }
  }

  return {
    slug,
    whatsapp_url: buildWhatsAppAdUrl(displayPhone, prefillMessage),
  };
}

export async function countStoreProducts(storeId: string): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("store_products")
    .select("*", { count: "exact", head: true })
    .eq("store_id", storeId);

  if (error) return 0;
  return count ?? 0;
}

export type PortalProductSearchHit = {
  id: string;
  title: string;
  description: string | null;
  sku: string;
  price: string;
  currency: string;
  imageUrl: string | null;
  image_urls: string[];
  options: Array<{ name: string; values: string[] }>;
  variants: Array<{
    id: string;
    title: string;
    sku: string | null;
    price: string;
    option_values: Record<string, string>;
  }>;
  bundles: Array<{
    quantity: number;
    price: string;
    label: string | null;
  }>;
};

function mapStoreProductToSearchHit(p: StoreProduct): PortalProductSearchHit {
  return {
    id: p.id,
    title: p.name,
    description: p.description || p.tagline || null,
    sku: p.sku,
    price: String(p.price),
    currency: p.currency,
    imageUrl: getPrimaryProductImageUrl(p),
    image_urls: p.image_urls ?? [],
    options: (p.options ?? []).map((o) => ({
      name: o.name,
      values: o.values ?? [],
    })),
    variants: (p.variants ?? []).map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      price: String(v.price ?? p.price),
      option_values: v.option_values ?? {},
    })),
    bundles: (p.bundles ?? []).map((b) => ({
      quantity: b.quantity,
      price: String(b.price),
      label: b.label,
    })),
  };
}

async function fetchActiveProductRows(
  storeId: string,
  filterOr: string | null,
  limit = 20
): Promise<StoreProduct[]> {
  const supabase = createAdminClient();
  let builder = supabase
    .from("store_products")
    .select("*")
    .eq("store_id", storeId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filterOr) {
    builder = builder.or(filterOr);
  }

  const { data, error } = await builder;
  if (error) {
    console.error("[searchPortalProducts]", error.message);
    return [];
  }

  return attachRelations(
    storeId,
    (data ?? []).map((row) => normalizeProductRow(row as Record<string, unknown>))
  );
}

/** Significant tokens for partial product-name matching. */
export function productSearchTokens(query: string): string[] {
  const stop = new Set([
    "a",
    "an",
    "the",
    "me",
    "my",
    "your",
    "you",
    "do",
    "does",
    "did",
    "have",
    "has",
    "any",
    "please",
    "tell",
    "about",
    "this",
    "that",
    "product",
    "products",
    "item",
    "items",
    "want",
    "order",
    "ordering",
    "looking",
    "for",
    "show",
    "details",
    "detail",
    "what",
    "is",
    "are",
    "of",
    "can",
    "i",
    "get",
    "buy",
    "how",
    "much",
    "price",
    "cost",
    "variant",
    "variants",
    "option",
    "options",
    "size",
    "sizes",
    "color",
    "colors",
    "colour",
    "colours",
    "stock",
    "available",
    "availability",
    "in",
    "and",
    "or",
    "with",
    "from",
    "store",
    "ai",
    "bot",
    "joke",
    "jokes",
    "robot",
    "hi",
    "hey",
    "heya",
    "hello",
    "hola",
    "yo",
    "sup",
    "thanks",
    "thank",
    "ok",
    "okay",
    "yes",
    "no",
    "salam",
    "assalam",
    "assalamu",
    "morning",
    "evening",
    "afternoon",
    "night",
    "good",
  ]);

  const isGreetingToken = (token: string) =>
    /^(hi+|hey+|heya+|hello+|hola+|yo+|sup+|thanks+|ok+|okay+)$/i.test(token);

  return Array.from(
    new Set(
      query
        .replace(/[^\p{L}\p{N}\s\-]/gu, " ")
        .split(/\s+/)
        .map((t) => escapeIlike(t))
        .filter(
          (t) =>
            t.length >= 2 &&
            !stop.has(t.toLowerCase()) &&
            !isGreetingToken(t)
        )
    )
  ).slice(0, 6);
}

/**
 * Extract a catalog search string from free text (SKU preferred, else name words).
 */
export function extractProductSearchQuery(text: string): string | null {
  const sku = extractSkuFromText(text);
  if (sku) return sku;

  const orderNamed = text.match(
    /\bwant\s+to\s+(?:order|buy)\s+(?:a\s+|an\s+|the\s+)?(.+?)(?:\?|\.|!|$|\bdo you have\b|\bplease\b)/i
  );
  if (orderNamed?.[1]) {
    const phrase = orderNamed[1].replace(/[?.!]+$/g, "").trim();
    const tokens = productSearchTokens(phrase);
    if (tokens.length) return tokens.join(" ").slice(0, 80);
  }

  const availabilityAsk = text.match(
    /\b(?:do you have|have you got|got any|any|looking for|searching for|need|want|show me|find)\b[\s,:-]*(.+)/i
  );
  if (availabilityAsk?.[1]) {
    let phrase = availabilityAsk[1].replace(/[?.!]+$/g, "").trim();
    // "want to order storage rack" → skip leading order phrasing
    phrase = phrase.replace(/^to\s+(?:order|buy)\s+/i, "").trim();
    const tokens = productSearchTokens(phrase);
    if (tokens.length) return tokens.join(" ").slice(0, 80);
  }

  const tokens = productSearchTokens(text);
  if (!tokens.length) return null;
  return tokens.join(" ").slice(0, 80);
}

export async function searchPortalProducts(
  storeId: string,
  query: string
): Promise<PortalProductSearchHit[]> {
  const skuHint = extractSkuFromText(query);
  const phrase = escapeIlike(skuHint || query);
  const tokens = productSearchTokens(skuHint || query);

  // Exact SKU path first
  if (skuHint) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("store_products")
      .select("*")
      .eq("store_id", storeId)
      .eq("status", "active")
      .ilike("sku", skuHint)
      .limit(5);
    if (data?.length) {
      const products = await attachRelations(
        storeId,
        data.map((row) => normalizeProductRow(row as Record<string, unknown>))
      );
      return products.map(mapStoreProductToSearchHit);
    }
  }

  const seen = new Map<string, StoreProduct>();

  const merge = (rows: StoreProduct[]) => {
    for (const p of rows) {
      if (!seen.has(p.id)) seen.set(p.id, p);
    }
  };

  // Full phrase match on name / sku / tagline / description
  if (phrase) {
    merge(
      await fetchActiveProductRows(
        storeId,
        `name.ilike.%${phrase}%,sku.ilike.%${phrase}%,tagline.ilike.%${phrase}%,description.ilike.%${phrase}%`
      )
    );
  }

  // Partial / half-name: match any significant token
  if (seen.size === 0 && tokens.length > 0) {
    const orParts = tokens.flatMap((t) => [
      `name.ilike.%${t}%`,
      `sku.ilike.%${t}%`,
      `tagline.ilike.%${t}%`,
    ]);
    merge(await fetchActiveProductRows(storeId, orParts.join(","), 20));
  }

  // Rank: more token hits in the title first
  const ranked = Array.from(seen.values()).sort((a, b) => {
    const score = (p: StoreProduct) => {
      const hay = `${p.name} ${p.tagline ?? ""} ${p.sku}`.toLowerCase();
      return tokens.reduce(
        (n, t) => n + (hay.includes(t.toLowerCase()) ? 1 : 0),
        0
      );
    };
    return score(b) - score(a);
  });

  return ranked.slice(0, 10).map(mapStoreProductToSearchHit);
}
