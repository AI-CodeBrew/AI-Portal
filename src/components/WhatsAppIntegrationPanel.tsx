"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import {
  ConnectionBadge,
  WhatsAppConnectionSteps,
} from "@/components/ConnectionStatus";
import { BrandIconBox } from "@/components/BrandIcons";
import { getWhatsAppWebhookPath } from "@/lib/whatsapp-webhook";
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

function CopyField({
  label,
  value,
  hint,
  onCopy,
}: {
  label: string;
  value: string;
  hint?: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-1 break-all font-mono text-sm text-slate-900">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

export function WhatsAppIntegrationPanel() {
  const { store, refresh: refreshStore } = useStoreStatus();
  const [siteOrigin, setSiteOrigin] = useState("");
  const [metaAppId, setMetaAppId] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");
  const [metaConfigId, setMetaConfigId] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [message, setMessage] = useState<{
    type: "info" | "error" | "success";
    text: string;
  } | null>(null);
  const [fbReady, setFbReady] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    setSiteOrigin(window.location.origin);
  }, []);

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

  const webhookUrl =
    store?.id && siteOrigin
      ? `${siteOrigin}${getWhatsAppWebhookPath(store.id)}`
      : "";

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ type: "success", text: `${label} copied to clipboard.` });
    } catch {
      setMessage({ type: "error", text: "Could not copy. Select and copy manually." });
    }
  }

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
      text: "Saved! Copy the webhook details below into Meta, then connect your number.",
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
          text: "Phone Number ID, WABA ID, and Access Token are required.",
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
        text: "Add your Embedded Signup Config ID first, or use manual connect.",
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
  const credentialsReady = store?.has_whatsapp_credentials ?? false;
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
              Send order confirmations and chat with customers
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
            hasCredentials={credentialsReady}
            webhookConfigured={Boolean(verifyToken)}
            isConnected={connected}
            phoneNumberId={store?.whatsapp_phone_number_id}
          />

          {connected && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="text-2xl">✓</span>
              <div>
                <p className="font-semibold text-emerald-900">WhatsApp is live</p>
                <p className="text-xs text-emerald-700">
                  Phone ID: {store?.whatsapp_phone_number_id}
                  {store?.shopify_connected
                    ? " · AI sales agent will reply to customer messages"
                    : " · Connect Shopify too so AI can search products and close deals"}
                </p>
              </div>
            </div>
          )}

          {/* Step 1 */}
          <section className="rounded-xl border border-slate-200 p-5">
            <h3 className="text-base font-bold text-slate-900">
              1. Add your Meta app details
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Create a free app at{" "}
              <a
                href="https://developers.facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 underline"
              >
                developers.facebook.com
              </a>
              , add the <strong>WhatsApp</strong> product, then copy:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600">
              <li>
                <strong>App ID</strong> — App settings → Basic → App ID
              </li>
              <li>
                <strong>App Secret</strong> — App settings → Basic → App secret
                (click Show)
              </li>
              <li>
                <strong>Config ID</strong> (optional) — WhatsApp → Embedded
                Signup → Configuration ID
              </li>
            </ul>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Meta App ID
                </label>
                <input
                  value={metaAppId}
                  onChange={(e) => setMetaAppId(e.target.value)}
                  placeholder="e.g. 123456789012345"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Meta App Secret
                </label>
                <input
                  type="password"
                  value={metaAppSecret}
                  onChange={(e) => setMetaAppSecret(e.target.value)}
                  placeholder={
                    credentialsReady ? "Leave blank to keep current" : "Required"
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Embedded Signup Config ID{" "}
                  <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <input
                  value={metaConfigId}
                  onChange={(e) => setMetaConfigId(e.target.value)}
                  placeholder="For one-click connect — WhatsApp → Embedded Signup in Meta"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>

            <button
              onClick={() => saveCredentials()}
              disabled={saving || connecting}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save & generate webhook token"}
            </button>
          </section>

          {/* Step 2 */}
          <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-5">
            <h3 className="text-base font-bold text-slate-900">
              2. Paste these into Meta
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Open your Meta app → <strong>WhatsApp</strong> →{" "}
              <strong>Configuration</strong> → Webhook section. Paste both values
              below, then click <strong>Verify and save</strong>.
            </p>

            {!credentialsReady ? (
              <p className="mt-4 rounded-lg border border-dashed border-blue-200 bg-white px-4 py-3 text-sm text-slate-600">
                Complete step 1 first — your personal webhook URL will appear here.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <CopyField
                  label="Callback URL (paste in Meta)"
                  value={webhookUrl || "Loading..."}
                  hint="This URL is unique to your store on this portal."
                  onCopy={() => copyText(webhookUrl, "Callback URL")}
                />
                <CopyField
                  label="Verify token (paste in Meta)"
                  value={verifyToken || "Save step 1 to generate"}
                  onCopy={() => copyText(verifyToken, "Verify token")}
                />
                <p className="text-xs text-slate-600">
                  Also subscribe to the <strong>messages</strong> field in Meta.
                </p>
                <a
                  href="https://developers.facebook.com/apps/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-sm font-semibold text-blue-700 hover:underline"
                >
                  Open Meta Developer Console →
                </a>
              </div>
            )}
          </section>

          {/* Step 3 */}
          <section className="rounded-xl border border-slate-200 p-5">
            <h3 className="text-base font-bold text-slate-900">
              3. Connect your WhatsApp number
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              After Meta webhook is verified, connect your business number.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => connectWhatsApp(false)}
                disabled={saving || connecting || !credentialsReady}
                className="rounded-lg bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1da851] disabled:opacity-50"
              >
                {connecting
                  ? "Connecting..."
                  : connected
                    ? "Reconnect with Meta"
                    : "Connect with Meta"}
              </button>
              <button
                type="button"
                onClick={() => setShowManual((v) => !v)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {showManual ? "Hide manual setup" : "Manual setup instead"}
              </button>
            </div>

            {showManual && (
              <div className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Where to find these in Meta
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Open{" "}
                    <a
                      href="https://developers.facebook.com/apps/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 underline"
                    >
                      developers.facebook.com/apps
                    </a>{" "}
                    → select your app → <strong>WhatsApp</strong> →{" "}
                    <strong>API Setup</strong>
                  </p>
                </div>

                <ol className="space-y-3 text-sm text-slate-700">
                  <li className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="font-semibold text-slate-900">
                      Phone Number ID
                    </p>
                    <p className="mt-1 text-slate-600">
                      On the <strong>API Setup</strong> page, under{" "}
                      <strong>Send and receive messages</strong>, find your phone
                      number. Copy the <strong>Phone number ID</strong> (a long
                      number like <code>123456789012345</code>). Not your actual
                      +92… phone number.
                    </p>
                  </li>
                  <li className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="font-semibold text-slate-900">WABA ID</p>
                    <p className="mt-1 text-slate-600">
                      On the same <strong>API Setup</strong> page, at the top
                      look for <strong>WhatsApp Business Account ID</strong>{" "}
                      (or open WhatsApp → <strong>Account tools</strong> → Account
                      overview). Copy that ID.
                    </p>
                  </li>
                  <li className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="font-semibold text-slate-900">
                      Permanent access token
                    </p>
                    <p className="mt-1 text-slate-600">
                      Meta only shows a <em>temporary</em> token on API Setup for
                      testing. For a permanent token:
                    </p>
                    <ol className="mt-2 list-inside list-decimal space-y-1 text-slate-600">
                      <li>
                        Go to{" "}
                        <a
                          href="https://business.facebook.com/settings/system-users"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline"
                        >
                          Meta Business Settings → System users
                        </a>
                      </li>
                      <li>
                        Create a system user (or pick an existing one) →{" "}
                        <strong>Add assets</strong> → assign your WhatsApp
                        Business Account
                      </li>
                      <li>
                        Click <strong>Generate new token</strong> → select your
                        app → enable{" "}
                        <code>whatsapp_business_messaging</code> and{" "}
                        <code>whatsapp_business_management</code>
                      </li>
                      <li>Copy the token and paste it below (it is shown once)</li>
                    </ol>
                    <p className="mt-2 text-xs text-slate-500">
                      Tip: If you only see a temporary token on API Setup, you can
                      use that for quick testing — but it expires in 24 hours. Use
                      a system-user token for production.
                    </p>
                  </li>
                </ol>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Phone Number ID
                    </label>
                    <input
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      placeholder="From API Setup → Phone number ID"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
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
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Access token
                    </label>
                    <input
                      type="password"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="System user token (permanent) or temporary token from API Setup"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
                    />
                  </div>
                </div>
                <button
                  onClick={() => connectWhatsApp(true)}
                  disabled={saving || connecting}
                  className="rounded-lg border border-[#25D366] px-4 py-2 text-sm font-semibold text-[#128C7E] hover:bg-emerald-50 disabled:opacity-50"
                >
                  Connect manually
                </button>
              </div>
            )}
          </section>

          <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
            <p>
              <strong>AI sales agent:</strong> after WhatsApp + Shopify are
              connected, customers get automatic replies on WhatsApp. The AI
              searches products, checks stock, creates draft orders, and helps
              close the sale.
            </p>
            <p>
              <strong>Template:</strong> approve <code>order_confirmed</code> in
              Meta Business Manager so customers get order updates.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
