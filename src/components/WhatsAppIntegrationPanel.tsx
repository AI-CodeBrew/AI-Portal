"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import {
  ConnectionBadge,
  WhatsAppConnectionSteps,
} from "@/components/ConnectionStatus";
import { BrandIconBox } from "@/components/BrandIcons";
import { useStoreStatus } from "@/hooks/useStoreStatus";

declare global {
  interface Window {
    FB: {
      init: (params: Record<string, unknown>) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit: () => void;
  }
}

export function WhatsAppIntegrationPanel({ appUrl }: { appUrl: string }) {
  const { store, refresh: refreshStore } = useStoreStatus();
  const [metaAppId, setMetaAppId] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");
  const [metaConfigId, setMetaConfigId] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<{
    type: "info" | "error" | "success";
    text: string;
  } | null>(null);
  const [fbReady, setFbReady] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (store) {
      setMetaAppId(store.meta_app_id ?? "");
      setMetaConfigId(store.meta_config_id ?? "");
      setVerifyToken(store.whatsapp_verify_token ?? "");
      setPhoneNumberId(store.whatsapp_phone_number_id ?? "");
      setWabaId(store.whatsapp_waba_id ?? "");
    }
  }, [store]);

  useEffect(() => {
    if (searchParams.get("connected") === "whatsapp") {
      setMessage({ type: "success", text: "WhatsApp connected successfully!" });
      refreshStore();
    }
  }, [searchParams, refreshStore]);

  const initFacebook = useCallback(() => {
    const appId = metaAppId || store?.meta_app_id;
    if (!window.FB || !appId) return;
    window.FB.init({
      appId,
      cookie: true,
      xfbml: true,
      version: "v21.0",
    });
    setFbReady(true);
  }, [metaAppId, store?.meta_app_id]);

  useEffect(() => {
    window.fbAsyncInit = initFacebook;
    if (window.FB) initFacebook();
  }, [initFacebook]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.origin !== "https://www.facebook.com" &&
        event.origin !== "https://web.facebook.com"
      ) {
        return;
      }
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data.type === "WA_EMBEDDED_SIGNUP") {
          const { phone_number_id, waba_id } = data.data ?? {};
          if (phone_number_id) setPhoneNumberId(phone_number_id);
          if (waba_id) setWabaId(waba_id);
          (
            window as Window & {
              __waSignup?: { phone_number_id: string; waba_id: string };
            }
          ).__waSignup = { phone_number_id, waba_id };
        }
      } catch {
        // ignore
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const webhookUrl = store?.id
    ? `${appUrl}/api/whatsapp-webhook?store=${store.id}`
    : `${appUrl}/api/whatsapp-webhook`;

  async function saveCredentials(): Promise<boolean> {
    if (!metaAppId.trim()) {
      setMessage({ type: "error", text: "Meta App ID is required." });
      return false;
    }
    if (!metaAppSecret.trim() && !store?.has_whatsapp_credentials) {
      setMessage({
        type: "error",
        text: "Meta App Secret is required for first-time setup.",
      });
      return false;
    }

    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/store/whatsapp-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metaAppId,
        metaAppSecret,
        metaConfigId,
        verifyToken: verifyToken || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setMessage({ type: "error", text: data.error ?? "Failed to save" });
      return false;
    }

    if (data.verifyToken) setVerifyToken(data.verifyToken);
    setMessage({
      type: "success",
      text: "Credentials saved. Configure the webhook in Meta, then connect your number.",
    });
    setMetaAppSecret("");
    await refreshStore();
    return true;
  }

  async function connectWhatsApp(manual = false) {
    setConnecting(true);
    setMessage(null);

    const needsSave =
      !store?.has_whatsapp_credentials ||
      metaAppSecret.trim() ||
      metaAppId !== store?.meta_app_id ||
      metaConfigId !== (store?.meta_config_id ?? "");

    if (needsSave) {
      const saved = await saveCredentials();
      if (!saved) {
        setConnecting(false);
        return;
      }
    }

    if (manual) {
      if (!phoneNumberId.trim() || !wabaId.trim() || !accessToken.trim()) {
        setMessage({
          type: "error",
          text: "Phone Number ID, WABA ID, and Access Token are required for manual connect.",
        });
        setConnecting(false);
        return;
      }

      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number_id: phoneNumberId.trim(),
          waba_id: wabaId.trim(),
          access_token: accessToken.trim(),
        }),
      });
      const data = await res.json();
      setConnecting(false);

      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Connection failed" });
        return;
      }

      setMessage({ type: "success", text: "WhatsApp connected!" });
      setAccessToken("");
      await refreshStore();
      return;
    }

    const configId = metaConfigId || store?.meta_config_id;
    if (!configId) {
      setMessage({
        type: "error",
        text: "Embedded Signup Config ID is required for one-click connect.",
      });
      setConnecting(false);
      return;
    }

    if (!window.FB || !fbReady) {
      setMessage({
        type: "error",
        text: "Facebook SDK not loaded yet. Wait a moment and try again.",
      });
      setConnecting(false);
      return;
    }

    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          const signup = (
            window as Window & {
              __waSignup?: { phone_number_id: string; waba_id: string };
            }
          ).__waSignup;

          fetch("/api/whatsapp/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: response.authResponse.code,
              phone_number_id: signup?.phone_number_id ?? phoneNumberId,
              waba_id: signup?.waba_id ?? wabaId,
            }),
          })
            .then((r) => r.json())
            .then(async (data) => {
              if (data.ok) {
                setMessage({ type: "success", text: "WhatsApp connected!" });
                await refreshStore();
              } else {
                setMessage({
                  type: "error",
                  text: data.error ?? "Connection failed",
                });
              }
            })
            .finally(() => setConnecting(false));
        } else {
          setMessage({ type: "error", text: "Signup cancelled" });
          setConnecting(false);
        }
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      }
    );
  }

  const connected = store?.whatsapp_connected ?? false;
  const msgStyles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
  };

  return (
    <>
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="lazyOnload"
        onLoad={initFacebook}
      />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-4 border-b border-slate-200 p-6">
          <BrandIconBox brand="whatsapp" size="lg" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">
                WhatsApp Business
              </h2>
              <ConnectionBadge
                connected={connected}
                label={connected ? "Connected" : "Not connected"}
              />
            </div>
            <p className="text-sm text-slate-600">
              Order confirmations, AI sales chat, and human inbox
            </p>
          </div>
        </div>

        <div className="space-y-6 p-6">
          {message && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm font-medium ${msgStyles[message.type]}`}
            >
              {message.text}
            </div>
          )}

          <WhatsAppConnectionSteps
            hasCredentials={store?.has_whatsapp_credentials ?? false}
            webhookConfigured={Boolean(store?.whatsapp_verify_token)}
            isConnected={connected}
            phoneNumberId={store?.whatsapp_phone_number_id}
          />

          {connected && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="text-2xl">✓</span>
              <div>
                <p className="font-semibold text-emerald-900">Active</p>
                <p className="text-xs text-emerald-700">
                  Phone ID: {store?.whatsapp_phone_number_id} · WABA:{" "}
                  {store?.whatsapp_waba_id}
                </p>
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-900">
              Step 1 — Meta app credentials
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Meta App ID *
                </label>
                <input
                  value={metaAppId}
                  onChange={(e) => setMetaAppId(e.target.value)}
                  placeholder="From developers.facebook.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Meta App Secret *
                </label>
                <input
                  type="password"
                  value={metaAppSecret}
                  onChange={(e) => setMetaAppSecret(e.target.value)}
                  placeholder={
                    store?.has_whatsapp_credentials ? "Leave blank to keep" : ""
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Embedded Signup Config ID
                </label>
                <input
                  value={metaConfigId}
                  onChange={(e) => setMetaConfigId(e.target.value)}
                  placeholder="For one-click connect (WhatsApp → Embedded Signup)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Webhook verify token
                </label>
                <input
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  placeholder="Auto-generated on save if left blank"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-900">
              Step 2 — Webhook in Meta Developer Console
            </h3>
            <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
              <p>
                In your Meta app → <strong>WhatsApp → Configuration</strong>,
                set:
              </p>
              <p>
                <strong>Callback URL:</strong>{" "}
                <code className="text-slate-800">{webhookUrl}</code>
              </p>
              <p>
                <strong>Verify token:</strong>{" "}
                <code className="text-slate-800">
                  {verifyToken || "(save credentials to generate)"}
                </code>
              </p>
              <p>Subscribe to the <code>messages</code> field.</p>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-900">
              Step 3 — Connect your WhatsApp number
            </h3>
            <p className="mb-3 text-sm text-slate-600">
              Use embedded signup (recommended) or paste tokens from Meta
              manually.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Phone Number ID
                </label>
                <input
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="From WhatsApp → API Setup"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  WABA ID
                </label>
                <input
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  placeholder="WhatsApp Business Account ID"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Permanent access token (manual only)
                </label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="From WhatsApp → API Setup → temporary/permanent token"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => saveCredentials()}
              disabled={saving || connecting}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save credentials"}
            </button>
            <button
              onClick={() => connectWhatsApp(false)}
              disabled={saving || connecting}
              className="rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1da851] disabled:opacity-50"
            >
              {connecting
                ? "Connecting..."
                : connected
                  ? "Reconnect (embedded)"
                  : "Connect (embedded signup)"}
            </button>
            <button
              onClick={() => connectWhatsApp(true)}
              disabled={saving || connecting}
              className="rounded-lg border border-[#25D366] px-4 py-2 text-sm font-semibold text-[#128C7E] hover:bg-emerald-50 disabled:opacity-50"
            >
              Connect manually
            </button>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
            <p>
              <strong>Where to get credentials:</strong>{" "}
              <a
                href="https://developers.facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 underline"
              >
                developers.facebook.com
              </a>{" "}
              → your app → WhatsApp → API Setup
            </p>
            <p>
              <strong>Template required:</strong> approve{" "}
              <code>order_confirmed</code> in Meta Business Manager before
              order confirmations send.
            </p>
            <p>
              Each reseller uses their own Meta app — no code changes needed.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
