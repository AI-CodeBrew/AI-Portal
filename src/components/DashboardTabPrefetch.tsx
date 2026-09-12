"use client";

import { useEffect } from "react";
import { prefetchJson } from "@/lib/client-fetch-cache";

const WARM_URLS: Array<{ key: string; url: string }> = [
  { key: "store:status", url: "/api/store" },
  { key: "dashboard:stats:all", url: "/api/dashboard/stats?period=all" },
  {
    key: "inbox:list:filter=all&page=1&limit=10",
    url: "/api/inbox?filter=all&page=1&limit=10",
  },
  { key: "store:products", url: "/api/store/products" },
  { key: "store:ai-settings", url: "/api/store/ai-settings" },
  { key: "shopify-products::1:10", url: "/api/store/shopify-products?limit=10&page=1" },
];

/** Warm the main reseller tabs in the background so switching feels instant. */
export function DashboardTabPrefetch() {
  useEffect(() => {
    const id = window.setTimeout(() => {
      for (const item of WARM_URLS) {
        prefetchJson(item.key, item.url, 60_000);
      }
    }, 350);
    return () => window.clearTimeout(id);
  }, []);

  return null;
}
