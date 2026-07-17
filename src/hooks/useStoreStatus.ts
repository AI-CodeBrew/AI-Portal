"use client";

import { useCallback, useEffect, useState } from "react";

export interface StoreStatus {
  id: string;
  store_name: string | null;
  shop_domain: string | null;
  shopify_api_key: string | null;
  shopify_scopes: string | null;
  has_shopify_credentials: boolean;
  shopify_connected: boolean;
  meta_app_id: string | null;
  meta_config_id: string | null;
  has_whatsapp_credentials: boolean;
  platform_whatsapp_ready?: boolean;
  whatsapp_verify_token: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_waba_id: string | null;
  whatsapp_display_phone?: string | null;
  whatsapp_connected: boolean;
  plan_id?: string | null;
  plan?: {
    id: string;
    name: string;
    productCount: number;
    productLimit: number | null;
    canAddProduct: boolean;
    shopifyAllowed: boolean;
    adminChatAllowed: boolean;
  };
}

export function useStoreStatus() {
  const [store, setStore] = useState<StoreStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/store");
      const data = await res.json();
      setStore(data.store ?? null);
    } catch {
      setStore(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { store, loading, refresh };
}
