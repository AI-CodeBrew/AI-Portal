export type OrderStatus = "pending" | "confirmed" | "cancelled";
export type OrderSource = "shopify" | "whatsapp_ai";
export type ShopifySyncStatus = "synced" | "failed" | "not_applicable";
export type ConversationStatus = "ai_handling" | "human_handoff" | "closed";
export type MessageDirection = "in" | "out";

export interface Store {
  id: string;
  store_name: string | null;
  shop_domain: string | null;
  shopify_api_key: string | null;
  shopify_api_secret: string | null;
  shopify_access_token: string | null;
  shopify_scopes: string | null;
  meta_app_id: string | null;
  meta_app_secret: string | null;
  meta_config_id: string | null;
  whatsapp_verify_token: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_access_token: string | null;
  whatsapp_waba_id: string | null;
  owner_email: string | null;
  owner_id: string | null;
  plan_id?: string | null;
  created_at: string;
}

export interface PortalUser {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "reseller";
  store_id: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  store_id: string;
  phone: string;
  name: string | null;
  shopify_customer_id: string | null;
  created_at: string;
}

export interface OrderItem {
  title: string;
  quantity: number;
  price: number;
  variant_id?: string;
  product_id?: string;
}

export interface OrderShippingAddress {
  name?: string | null;
  phone?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  zip?: string | null;
}

export interface Order {
  id: string;
  store_id: string;
  customer_id: string | null;
  shopify_order_id: string | null;
  shopify_draft_order_id: string | null;
  order_number: string | null;
  items: OrderItem[];
  total: number | null;
  currency: string | null;
  status: OrderStatus;
  source: OrderSource;
  confirmed_by: string | null;
  confirmed_at: string | null;
  shopify_sync_status: ShopifySyncStatus | null;
  shopify_sync_error: string | null;
  tracking_number: string | null;
  tracking_company: string | null;
  shopify_fulfillment_id: string | null;
  shipping_address?: OrderShippingAddress | null;
  created_at: string;
  customers?: Customer | null;
}

export interface WhatsappConversation {
  id: string;
  store_id: string;
  customer_id: string | null;
  customer_phone: string;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
  admin_read_at?: string | null;
}

export interface WhatsappMessage {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  content: string;
  created_at: string;
}

export interface MerchantSession {
  storeId: string;
  shopDomain: string;
}
