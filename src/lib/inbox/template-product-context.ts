import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/currency";
import {
  getPrimaryProductImageUrl,
  getStoreProduct,
} from "@/lib/products/products-service";
import { getShopifyCatalogProduct } from "@/lib/shopify";
import type { Store } from "@/lib/types";
import {
  inboxCatalogProductToSearchProduct,
  loadShopifyProductForInboxSend,
} from "@/lib/inbox/inbox-product-search";

export type TemplateProductContext = {
  source: "portal" | "shopify";
  productId: string;
  variantId: string | null;
  title: string;
  sku: string | null;
  priceFormatted: string;
  imageUrl: string | null;
  /** Path segment for Meta URL button {{1}} — product handle or slug */
  urlPath: string | null;
  productUrl: string | null;
};

function normalizeShopHost(shopDomain: string): string {
  const d = shopDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (d.includes(".")) return d;
  return `${d}.myshopify.com`;
}

export function buildShopifyProductUrl(
  shopDomain: string | null,
  handleOrSlug: string
): string | null {
  if (!shopDomain?.trim() || !handleOrSlug.trim()) return null;
  const host = normalizeShopHost(shopDomain);
  const path = encodeURIComponent(handleOrSlug.trim()).replace(/%2F/g, "/");
  return `https://${host}/products/${path}`;
}

export async function resolveTemplateProductContext(params: {
  store: Store;
  source: "portal" | "shopify";
  productId: string;
  variantId?: string | null;
}): Promise<TemplateProductContext | null> {
  const variantId = params.variantId?.trim() || null;

  if (params.source === "shopify") {
    const hit = await loadShopifyProductForInboxSend(
      params.store,
      params.productId,
      variantId ?? undefined
    );
    if (!hit) return null;

    const full = await getShopifyCatalogProduct(
      params.store.shop_domain!,
      params.store.shopify_access_token!,
      Number(params.productId)
    );
    const handle = full?.handle?.trim() || params.productId;
    const chosenVariant =
      (variantId && hit.variants.find((v) => v.id === variantId)) ||
      hit.variants[0];

    return {
      source: "shopify",
      productId: params.productId,
      variantId: chosenVariant?.id ?? null,
      title: hit.title,
      sku: chosenVariant?.sku ?? hit.sku,
      priceFormatted:
        chosenVariant?.priceFormatted ?? hit.variants[0]?.priceFormatted ?? hit.price,
      imageUrl: hit.imageUrl,
      urlPath: handle,
      productUrl: buildShopifyProductUrl(params.store.shop_domain, handle),
    };
  }

  const product = await getStoreProduct(params.store.id, params.productId);
  if (!product) return null;

  const variant =
    (variantId && product.variants?.find((v) => v.id === variantId)) ||
    product.variants?.[0];
  const price = variant?.price ?? product.price;
  const imageUrl = getPrimaryProductImageUrl(product);

  const supabase = createAdminClient();
  let urlPath = product.sku?.trim() || product.id.slice(0, 8);
  let productUrl: string | null = null;

  const { data: skuRow } = await supabase
    .from("shopify_product_skus")
    .select("shopify_product_id")
    .eq("store_id", params.store.id)
    .eq("sku", product.sku)
    .maybeSingle();

  if (
    skuRow?.shopify_product_id &&
    params.store.shop_domain &&
    params.store.shopify_access_token
  ) {
    const shopifyId = Number(skuRow.shopify_product_id);
    if (Number.isFinite(shopifyId) && shopifyId > 0) {
      const full = await getShopifyCatalogProduct(
        params.store.shop_domain,
        params.store.shopify_access_token,
        shopifyId
      );
      if (full?.handle) {
        urlPath = full.handle;
        productUrl = buildShopifyProductUrl(
          params.store.shop_domain,
          full.handle
        );
      }
    }
  }

  if (!productUrl && params.store.shop_domain) {
    productUrl = buildShopifyProductUrl(params.store.shop_domain, urlPath);
  }

  return {
    source: "portal",
    productId: product.id,
    variantId: variant?.id ?? null,
    title: product.name,
    sku: product.sku,
    priceFormatted: formatMoney(Number(price), product.currency),
    imageUrl,
    urlPath,
    productUrl,
  };
}

export function templateProductSummaryLine(ctx: TemplateProductContext): string {
  const parts = [ctx.title];
  if (ctx.priceFormatted) parts.push(ctx.priceFormatted);
  if (ctx.sku) parts.push(`SKU ${ctx.sku}`);
  return parts.join(" · ");
}

export function templateProductToSearchShape(ctx: TemplateProductContext) {
  return inboxCatalogProductToSearchProduct({
    key: `${ctx.source}:${ctx.productId}`,
    source: ctx.source,
    id: ctx.productId,
    title: ctx.title,
    sku: ctx.sku,
    price: ctx.priceFormatted,
    currency: "",
    imageUrl: ctx.imageUrl,
    variants: ctx.variantId
      ? [
          {
            id: ctx.variantId,
            title: "Selected",
            sku: ctx.sku,
            price: ctx.priceFormatted,
            priceFormatted: ctx.priceFormatted,
          },
        ]
      : [],
  });
}
