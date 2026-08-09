"use client";

import { useCallback, useEffect, useState } from "react";
import { cachedJsonFetch, peekCachedJson } from "@/lib/client-fetch-cache";

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

const STORE_STATUS_KEY = "store:status";

export function useStoreStatus() {
  const cached = peekCachedJson<{ store?: StoreStatus | null }>(STORE_STATUS_KEY);
  const [store, setStore] = useState<StoreStatus | null>(cached?.store ?? null);
  const [loading, setLoading] = useState(!cached?.store);

  const refresh = useCallback(async (force = false) => {
    try {
      const { data } = await cachedJsonFetch<{
        store?: StoreStatus | null;
      }>(STORE_STATUS_KEY, "/api/store", {
        ttlMs: 60_000,
        staleWhileRevalidate: !force,
        force,
      });
      setStore(data.store ?? null);
    } catch {
      setStore(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  return {
    store,
    loading,
    refresh: () => refresh(true),
  };
}
