export type ProductDiscountType = "percent" | "fixed";

export interface ProductOptionInput {
  name: string;
  values: string[];
}

export interface ProductVariantInput {
  title: string;
  sku?: string | null;
  price?: number | null;
  option_values: Record<string, string>;
}

export interface ProductBundleInput {
  quantity: number;
  price: number;
  label?: string | null;
}

export interface ProductInput {
  name: string;
  tagline?: string | null;
  description?: string | null;
  image_url?: string | null;
  image_urls?: string[];
  price: number;
  currency: string;
  target_country: string;
  sku: string;
  discount_enabled?: boolean;
  discount_type?: ProductDiscountType | null;
  discount_value?: number | null;
  options?: ProductOptionInput[];
  variants?: ProductVariantInput[];
  bundles?: ProductBundleInput[];
}

export interface StoreProductOption {
  id: string;
  product_id: string;
  store_id: string;
  name: string;
  sort_order: number;
  values: string[];
}

export interface StoreProductVariant {
  id: string;
  product_id: string;
  store_id: string;
  title: string;
  sku: string | null;
  price: number | null;
  option_values: Record<string, string>;
  sort_order: number;
}

export interface StoreProductBundle {
  id: string;
  product_id: string;
  store_id: string;
  quantity: number;
  price: number;
  label: string | null;
  sort_order: number;
}

export interface StoreProduct {
  id: string;
  store_id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  image_url: string | null;
  image_urls: string[];
  price: number;
  currency: string;
  target_country: string;
  sku: string;
  discount_enabled: boolean;
  discount_type: ProductDiscountType | null;
  discount_value: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  options?: StoreProductOption[];
  variants?: StoreProductVariant[];
  bundles?: StoreProductBundle[];
  ad_link?: {
    id: string;
    slug: string;
    whatsapp_url?: string;
    click_count: number;
  } | null;
}

/** Lightweight row for products list — no images/description/variants. */
export interface StoreProductSummary {
  id: string;
  name: string;
  tagline: string | null;
  price: number;
  currency: string;
  sku: string;
  options?: Array<{ name: string; values: string[] }>;
}
