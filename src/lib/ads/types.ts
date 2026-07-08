export interface AdProductContext {
  slug: string;
  productTitle: string;
  productDescription: string | null;
  variantTitle: string | null;
  price: string | null;
  currency: string | null;
  shopifyProductId: string;
  shopifyVariantId: string | null;
}

export interface AdWhatsAppLink {
  id: string;
  store_id: string;
  slug: string;
  shopify_product_id: string;
  shopify_variant_id: string | null;
  product_title: string;
  product_description: string | null;
  variant_title: string | null;
  price: string | null;
  currency: string | null;
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
