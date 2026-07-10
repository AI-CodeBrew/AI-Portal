export interface AdProductContext {
  slug: string;
  productTitle: string;
  productDescription: string | null;
  variantTitle: string | null;
  price: string | null;
  currency: string | null;
  sku: string | null;
  imageUrl: string | null;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  portalProductId: string | null;
  portalVariantId: string | null;
  source: "shopify" | "portal";
}

export interface AdWhatsAppLink {
  id: string;
  store_id: string;
  slug: string;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  portal_product_id?: string | null;
  portal_variant_id?: string | null;
  product_sku?: string | null;
  product_title: string;
  product_description: string | null;
  variant_title: string | null;
  price: string | null;
  currency: string | null;
  image_url?: string | null;
  prefill_message: string;
  click_count: number;
  created_at: string;
  whatsapp_url?: string;
}

export interface AdLinkProductSearchResult {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  variants: Array<{
    id: number;
    title: string;
    price: string;
    in_stock: boolean;
  }>;
}
