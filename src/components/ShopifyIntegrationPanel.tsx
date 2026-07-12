"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DEFAULT_SHOPIFY_SCOPES } from "@/lib/shopify";
import {
  ShopifyConnectionSteps,
  ConnectionBadge,
} from "@/components/ConnectionStatus";
import { BrandIconBox } from "@/components/BrandIcons";
import { useStoreStatus } from "@/hooks/useStoreStatus";

const ERROR_MESSAGES: Record<string, string> = {
  missing_credentials:
    "Save your Shopify API key and secret first, then click Connect.",
  missing_shop: "Enter your shop domain before connecting.",
  invalid_credentials:
    "Could not read your API secret. Re-enter it and save again.",
  oauth_failed: "Shopify authorization was denied or failed. Try again.",
  oauth_callback:
    "Could not complete Shopify connection. Check your API key/secret and redirect URL in Shopify Partners.",
  oauth_mismatch: "Session mismatch during OAuth. Please try connecting again.",
  shop_taken: "This shop is already linked to another account.",
};

export function ShopifyIntegrationPanel({ appUrl }: { appUrl: string }) {
  const { store, refresh: refreshStore } = useStoreStatus();
  const [storeName, setStoreName] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [scopes, setScopes] = useState(DEFAULT_SHOPIFY_SCOPES);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{
    type: "info" | "error" | "success";
    text: string;
  } | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (store) {
      setStoreName(store.store_name ?? "");
      setShopDomain(store.shop_domain ?? "");
      setApiKey(store.shopify_api_key ?? "");
      setScopes(store.shopify_scopes ?? DEFAULT_SHOPIFY_SCOPES);
    }
  }, [store]);

  useEffect(() => {
    const error = searchParams.get("error");
    const connected = searchParams.get("connected");
    if (error && ERROR_MESSAGES[error]) {
      setMessage({ type: "error", text: ERROR_MESSAGES[error] });
    } else if (connected === "shopify") {
      setMessage({
        type: "success",
        text: "Shopify connected! New orders will sync to the Orders tab.",
      });
      refreshStore();
    }
  }, [searchParams, refreshStore]);

  async function saveCredentials(): Promise<boolean> {
    if (!shopDomain.trim() || !apiKey.trim()) {
      setMessage({ type: "error", text: "Shop domain and API key are required." });
      return false;
    }
    if (!apiSecret.trim() && !store?.has_shopify_credentials) {
      setMessage({ type: "error", text: "API secret is required for first-time setup." });
      return false;
    }
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/store/shopify-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeName, shopDomain, apiKey, apiSecret, scopes }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage({ type: "error", text: data.error ?? "Failed to save" });
      return false;
    }
    setMessage({ type: "success", text: "Credentials saved. Click Connect to authorize." });
    setApiSecret("");
    await refreshStore();
    return true;
  }

  async function connectShopify() {
    setConnecting(true);
    const needsSave =
      !store?.has_shopify_credentials ||
      apiSecret.trim() ||
      shopDomain !== store?.shop_domain ||
      apiKey !== store?.shopify_api_key;
    if (needsSave) {
      const saved = await saveCredentials();
      if (!saved) {
        setConnecting(false);
        return;
      }
    }
    setMessage({ type: "info", text: "Redirecting to Shopify..." });
    window.location.href = "/auth/shopify/start";
  }

  async function disconnectShopify() {
    if (disconnecting) return;
    if (
      !confirm(
        "Disconnect Shopify from this store? Order sync will stop until you connect again. You can then link a different Shopify store."
      )
    ) {
      return;
    }

    setDisconnecting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/store/shopify-credentials", {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to disconnect");
      }
      setShopDomain("");
      setApiKey("");
      setApiSecret("");
      setScopes(DEFAULT_SHOPIFY_SCOPES);
      setMessage({
        type: "success",
        text: "Shopify disconnected. Enter a new shop domain and connect again anytime.",
      });
      await refreshStore();
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Failed to disconnect Shopify",
      });
    } finally {
      setDisconnecting(false);
    }
  }

  const msgStyles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-4 border-b border-slate-200 p-6">
        <BrandIconBox brand="shopify" size="lg" />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">Shopify</h2>
            <ConnectionBadge
              connected={store?.shopify_connected ?? false}
              label={store?.shopify_connected ? "Connected" : "Not connected"}
            />
          </div>
          <p className="text-sm text-slate-600">
            Sync orders from your Shopify store into the portal
          </p>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {message && (
          <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${msgStyles[message.type]}`}>
            {message.text}
          </div>
        )}

        <ShopifyConnectionSteps
          hasCredentials={store?.has_shopify_credentials ?? false}
          isConnected={store?.shopify_connected ?? false}
          shopDomain={store?.shop_domain}
        />

        {store?.shopify_connected && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <span className="text-2xl">✓</span>
            <div>
              <p className="font-semibold text-emerald-900">Active — {store.shop_domain}</p>
              <p className="text-xs text-emerald-700">
                Orders sync from Shopify API · Confirm here updates Shopify + WhatsApp
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Store name</label>
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="My Fashion Store"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Shop domain *</label>
            <input
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              placeholder="mystore.myshopify.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">API key *</label>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">API secret *</label>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder={store?.has_shopify_credentials ? "Leave blank to keep" : ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Scopes</label>
            <input
              value={scopes}
              onChange={(e) => setScopes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => saveCredentials()}
            disabled={saving || connecting || disconnecting}
            className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save credentials"}
          </button>
          <button
            type="button"
            onClick={connectShopify}
            disabled={saving || connecting || disconnecting}
            className="min-h-11 rounded-lg bg-[#96BF48] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {connecting
              ? "Redirecting..."
              : store?.shopify_connected
                ? "Reconnect"
                : "Connect Shopify"}
          </button>
          {(store?.shopify_connected || store?.has_shopify_credentials) && (
            <button
              type="button"
              onClick={disconnectShopify}
              disabled={saving || connecting || disconnecting}
              className="min-h-11 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          )}
        </div>

        <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
          <p>
            <strong>Required scopes:</strong>{" "}
            <code>read_orders</code>, <code>write_orders</code>,{" "}
            <code>read_customers</code>, <code>write_draft_orders</code>
          </p>
          <p>
            If orders don&apos;t load, click <strong>Reconnect</strong> after
            adding scopes in Shopify Partners.
          </p>
          <p>
            <strong>Redirect URL:</strong>{" "}
            <code className="text-slate-800">{appUrl}/auth/shopify/callback</code>
          </p>
          <p>
            <strong>Webhook URL:</strong>{" "}
            <code className="text-slate-800">{appUrl}/api/webhook/shopify</code>
          </p>
        </div>
      </div>
    </div>
  );
}
