"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import {
  ConnectionBadge,
  WhatsAppConnectionSteps,
} from "@/components/ConnectionStatus";
import { BrandIconBox } from "@/components/BrandIcons";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import { WHATSAPP_GRAPH_API_VERSION } from "@/lib/whatsapp/graph";
import {
  readEmbeddedSignupFromMessageEvent,
  waitForEmbeddedSignupAssets,
} from "@/lib/whatsapp/embedded-signup-session";

declare global {
  interface Window {
    FB: {
      init: (params: Record<string, unknown>) => void;
      login: (
        callback: (response: {
          authResponse?: { code?: string };
          status?: string;
        }) => void,
        options: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit: () => void;
  }
}

type ConnectStatus = "idle" | "connecting" | "connected" | "error";

export function WhatsAppIntegrationPanel() {
  const { store, refresh: refreshStore } = useStoreStatus();
  const [platformAppId, setPlatformAppId] = useState<string | null>(null);
  const [platformConfigId, setPlatformConfigId] = useState<string | null>(null);
  const [platformReady, setPlatformReady] = useState(false);
  const [platformLoading, setPlatformLoading] = useState(true);
  const [fbReady, setFbReady] = useState(false);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("idle");
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{
    type: "info" | "error" | "success";
    text: string;
  } | null>(null);
  const searchParams = useSearchParams();

  const loadPlatform = useCallback(async () => {
    setPlatformLoading(true);
    try {
      const res = await fetch("/api/platform/meta-public");
      const data = await res.json();
      setPlatformAppId(data.metaAppId ?? null);
      setPlatformConfigId(data.metaConfigId ?? null);
      setPlatformReady(Boolean(data.configured));
    } catch {
      setPlatformReady(false);
    } finally {
      setPlatformLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlatform();
  }, [loadPlatform]);

  useEffect(() => {
    if (searchParams.get("connected") === "whatsapp") {
      setMessage({ type: "success", text: "WhatsApp connected successfully!" });
      setConnectStatus("connected");
      refreshStore();
    }
  }, [searchParams, refreshStore]);

  useEffect(() => {
    if (store?.whatsapp_connected) setConnectStatus("connected");
  }, [store?.whatsapp_connected]);

  const initFacebook = useCallback(() => {
    if (!window.FB || !platformAppId) return;
    window.FB.init({
      appId: platformAppId,
      cookie: true,
      xfbml: true,
      version: WHATSAPP_GRAPH_API_VERSION,
    });
    setFbReady(true);
  }, [platformAppId]);

  useEffect(() => {
    window.fbAsyncInit = initFacebook;
    if (window.FB) initFacebook();
  }, [initFacebook]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const assets = readEmbeddedSignupFromMessageEvent(event);
      if (assets) window.__waSignup = assets;
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function finishConnect(payload: {
    code?: string;
    phone_number_id?: string;
    waba_id?: string;
  }) {
    const res = await fetch("/api/whatsapp/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(
        data.error ??
          "We could not finish connecting. Please try again."
      );
    }
    setConnectStatus("connected");
    setMessage({
      type: "success",
      text: data.display_phone
        ? `WhatsApp connected ✅ ${data.display_phone}`
        : "WhatsApp connected ✅",
    });
    await refreshStore();
  }

  function connectWhatsApp() {
    setMessage(null);

    if (!platformReady || !platformAppId || !platformConfigId) {
      setMessage({
        type: "error",
        text: "WhatsApp setup is not available yet. Please contact support.",
      });
      return;
    }

    if (!window.FB || !fbReady) {
      setMessage({
        type: "error",
        text: "Facebook is still loading. Wait a moment and try again.",
      });
      return;
    }

    setConnectStatus("connecting");
    window.__waSignup = undefined;

    window.FB.login(
      (response) => {
        if (!response.authResponse?.code) {
          setConnectStatus(store?.whatsapp_connected ? "connected" : "idle");
          const status = response.status;
          setMessage({
            type: "error",
            text:
              status === "unknown" || status === "not_authorized"
                ? "Facebook blocked login for this account (often “Feature unavailable”). Your admin Facebook may work because it has an app role. Ask the platform admin to finish Meta Live setup: App Domains, User Data Deletion URL, Data Use Checkup, and Advanced Access for public_profile — or add your Facebook as an App Tester."
                : "Signup was cancelled or Facebook Login failed. Try again, or use a different Facebook account.",
          });
          return;
        }

        const code = response.authResponse.code;
        void waitForEmbeddedSignupAssets(2500)
          .then((signup) =>
            finishConnect({
              code,
              phone_number_id: signup?.phone_number_id,
              waba_id: signup?.waba_id,
            })
          )
          .catch((err) => {
            setConnectStatus(store?.whatsapp_connected ? "connected" : "error");
            setMessage({
              type: "error",
              text:
                err instanceof Error
                  ? err.message
                  : "WhatsApp connection failed. Please try again.",
            });
          });
      },
      {
        config_id: platformConfigId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          version: "v4",
          sessionInfoVersion: "3",
        },
      }
    );
  }

  async function disconnectWhatsApp() {
    if (disconnecting) return;
    if (
      !confirm(
        "Disconnect WhatsApp from this store? You will stop receiving and sending WhatsApp messages until you connect again."
      )
    ) {
      return;
    }

    setDisconnecting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/whatsapp/connect", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to disconnect");
      }
      setConnectStatus("idle");
      setMessage({
        type: "success",
        text: "WhatsApp disconnected. You can connect again anytime.",
      });
      await refreshStore();
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Failed to disconnect WhatsApp",
      });
    } finally {
      setDisconnecting(false);
    }
  }

  const connected = store?.whatsapp_connected ?? false;
  const phoneLabel =
    store?.whatsapp_display_phone ||
    store?.whatsapp_phone_number_id ||
    null;

  const statusLabel =
    connectStatus === "connecting"
      ? "Connecting..."
      : connected
        ? phoneLabel
          ? `Connected ✅ ${phoneLabel}`
          : "Connected ✅"
        : "WhatsApp: Not Connected";

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
                label={
                  connectStatus === "connecting"
                    ? "Connecting..."
                    : connected
                      ? "Connected"
                      : "Not connected"
                }
              />
            </div>
            <p className="text-sm text-slate-600">
              Connect your WhatsApp so customers can message you and receive
              order updates. Takes about 2 minutes.
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

          <div
            className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
              connected
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : connectStatus === "connecting"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-slate-200 bg-slate-50 text-slate-800"
            }`}
          >
            {statusLabel}
          </div>

          <WhatsAppConnectionSteps
            platformReady={platformReady}
            isConnected={connected}
            phoneLabel={phoneLabel}
          />

          {platformLoading ? (
            <p className="text-sm text-slate-500">Checking platform setup…</p>
          ) : !platformReady ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              WhatsApp connect is not available yet. An admin needs to finish{" "}
              <strong>WhatsApp Platform Setup</strong> first. Please contact
              support if this persists.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 p-5">
              <p className="text-sm text-slate-600">
                Connect your WhatsApp so customers can message you and receive
                order updates. Takes about 2 minutes.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={connectWhatsApp}
                  disabled={
                    connectStatus === "connecting" ||
                    disconnecting ||
                    !fbReady
                  }
                  className="rounded-lg bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1da851] disabled:opacity-50"
                >
                  {connectStatus === "connecting"
                    ? "Connecting..."
                    : connected
                      ? "Reconnect WhatsApp"
                      : "Connect WhatsApp"}
                </button>
                {connected && (
                  <button
                    type="button"
                    onClick={disconnectWhatsApp}
                    disabled={disconnecting || connectStatus === "connecting"}
                    className="rounded-lg border border-red-200 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {disconnecting ? "Disconnecting..." : "Disconnect"}
                  </button>
                )}
              </div>
              {!fbReady && (
                <p className="mt-2 text-xs text-slate-500">
                  Loading Facebook SDK…
                </p>
              )}
            </div>
          )}

          <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
            <p>
              <strong>AI sales agent:</strong> after WhatsApp + Shopify are
              connected, customers get automatic replies on WhatsApp.
            </p>
            <p>
              <strong>Templates:</strong> approve message templates in Meta
              Business Manager so customers get order updates.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
