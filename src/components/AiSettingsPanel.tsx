"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SHOPIFY_CONFIRM_INSTRUCTIONS,
  DEFAULT_WHATSAPP_SALES_INSTRUCTIONS,
  REPLY_LENGTH_OPTIONS,
  UNLIMITED_CONTEXT_VALUE,
  type AiReplyLength,
  type StoreAiSettings,
} from "@/lib/ai/ai-settings-types";
import type { WhatsAppMessageTemplate } from "@/lib/whatsapp/message-templates";
import Link from "next/link";

type TabId = "general" | "modes";

const DEFAULT_OPENING =
  "Hi! Welcome to {store_name} 👋 I'm {agent_name}. How can I help you today?";

export function AiSettingsPanel() {
  const [tab, setTab] = useState<TabId>("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settings, setSettings] = useState<StoreAiSettings | null>(null);
  const [approvedWaTemplates, setApprovedWaTemplates] = useState<
    WhatsAppMessageTemplate[]
  >([]);
  const [platformDefaults, setPlatformDefaults] =
    useState<StoreAiSettings | null>(null);

  const [agentName, setAgentName] = useState("");
  const [sendOpeningMessage, setSendOpeningMessage] = useState(true);
  const [openingMessage, setOpeningMessage] = useState("");
  const [replyLength, setReplyLength] = useState<AiReplyLength>("medium");
  const [whatsappOrderTemplateId, setWhatsappOrderTemplateId] = useState<
    string | null
  >(null);

  const [whatsappSalesInstructions, setWhatsappSalesInstructions] =
    useState("");
  const [shopifyConfirmInstructions, setShopifyConfirmInstructions] =
    useState("");

  const [chatHistoryLimit, setChatHistoryLimit] = useState("");
  const [sessionWindowHours, setSessionWindowHours] = useState("");
  const [unlimitedMemory, setUnlimitedMemory] = useState(false);
  const [recoveryDiscountPercent, setRecoveryDiscountPercent] = useState("");
  const [recoveryBundleDiscountPercent, setRecoveryBundleDiscountPercent] =
    useState("");
  const [conversationReplyLimit, setConversationReplyLimit] = useState("");
  const [conversationReplyWindowHours, setConversationReplyWindowHours] =
    useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/store/ai-settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load settings");

      const s = data.settings as StoreAiSettings;
      setSettings(s);
      setApprovedWaTemplates(data.approvedWhatsAppTemplates ?? []);
      setPlatformDefaults(data.platformDefaults ?? null);
      setAgentName(s.agentName ?? "");
      setSendOpeningMessage(s.sendOpeningMessage !== false);
      setOpeningMessage(s.openingMessage ?? "");
      setReplyLength(s.replyLength ?? "medium");
      setWhatsappOrderTemplateId(s.whatsappOrderTemplateId ?? null);
      setWhatsappSalesInstructions(s.whatsappSalesInstructions ?? "");
      setShopifyConfirmInstructions(s.shopifyConfirmInstructions ?? "");
      setChatHistoryLimit(
        s.chatHistoryLimit != null ? String(s.chatHistoryLimit) : ""
      );
      setSessionWindowHours(
        s.sessionWindowHours != null ? String(s.sessionWindowHours) : ""
      );
      setUnlimitedMemory(
        s.chatHistoryLimit === UNLIMITED_CONTEXT_VALUE &&
          s.sessionWindowHours === UNLIMITED_CONTEXT_VALUE
      );
      setRecoveryDiscountPercent(
        s.recoveryDiscountPercent != null
          ? String(s.recoveryDiscountPercent)
          : ""
      );
      setRecoveryBundleDiscountPercent(
        s.recoveryBundleDiscountPercent != null
          ? String(s.recoveryBundleDiscountPercent)
          : ""
      );
      setConversationReplyLimit(
        s.conversationReplyLimit != null
          ? String(s.conversationReplyLimit)
          : ""
      );
      setConversationReplyWindowHours(
        s.conversationReplyWindowHours != null
          ? String(s.conversationReplyWindowHours)
          : ""
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetGeneral() {
    if (!settings) return;
    setAgentName(settings.agentName ?? "");
    setSendOpeningMessage(settings.sendOpeningMessage !== false);
    setOpeningMessage(settings.openingMessage ?? "");
    setReplyLength(settings.replyLength ?? "medium");
    setWhatsappOrderTemplateId(settings.whatsappOrderTemplateId ?? null);
    setChatHistoryLimit(
      settings.chatHistoryLimit != null
        ? String(settings.chatHistoryLimit)
        : ""
    );
    setSessionWindowHours(
      settings.sessionWindowHours != null
        ? String(settings.sessionWindowHours)
        : ""
    );
    setUnlimitedMemory(
      settings.chatHistoryLimit === UNLIMITED_CONTEXT_VALUE &&
        settings.sessionWindowHours === UNLIMITED_CONTEXT_VALUE
    );
    setRecoveryDiscountPercent(
      settings.recoveryDiscountPercent != null
        ? String(settings.recoveryDiscountPercent)
        : ""
    );
    setRecoveryBundleDiscountPercent(
      settings.recoveryBundleDiscountPercent != null
        ? String(settings.recoveryBundleDiscountPercent)
        : ""
    );
    setConversationReplyLimit(
      settings.conversationReplyLimit != null
        ? String(settings.conversationReplyLimit)
        : ""
    );
    setConversationReplyWindowHours(
      settings.conversationReplyWindowHours != null
        ? String(settings.conversationReplyWindowHours)
        : ""
    );
    setSuccess(null);
    setError(null);
  }

  function resetModes() {
    if (!settings) return;
    setWhatsappSalesInstructions(settings.whatsappSalesInstructions ?? "");
    setShopifyConfirmInstructions(settings.shopifyConfirmInstructions ?? "");
    setSuccess(null);
    setError(null);
  }

  async function saveGeneral() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/store/ai-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName: agentName || null,
          sendOpeningMessage,
          openingMessage: openingMessage || null,
          replyLength,
          whatsappOrderTemplateId: whatsappOrderTemplateId || null,
          chatHistoryLimit: unlimitedMemory
            ? UNLIMITED_CONTEXT_VALUE
            : chatHistoryLimit.trim() === ""
              ? null
              : Number(chatHistoryLimit),
          sessionWindowHours: unlimitedMemory
            ? UNLIMITED_CONTEXT_VALUE
            : sessionWindowHours.trim() === ""
              ? null
              : Number(sessionWindowHours),
          recoveryDiscountPercent:
            recoveryDiscountPercent.trim() === ""
              ? null
              : Number(recoveryDiscountPercent),
          recoveryBundleDiscountPercent:
            recoveryBundleDiscountPercent.trim() === ""
              ? null
              : Number(recoveryBundleDiscountPercent),
          conversationReplyLimit:
            conversationReplyLimit.trim() === ""
              ? null
              : Number(conversationReplyLimit),
          conversationReplyWindowHours:
            conversationReplyWindowHours.trim() === ""
              ? null
              : Number(conversationReplyWindowHours),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSettings(data.settings);
      const s = data.settings as StoreAiSettings;
      setWhatsappOrderTemplateId(s.whatsappOrderTemplateId ?? null);
      setChatHistoryLimit(
        s.chatHistoryLimit != null ? String(s.chatHistoryLimit) : ""
      );
      setSessionWindowHours(
        s.sessionWindowHours != null ? String(s.sessionWindowHours) : ""
      );
      setUnlimitedMemory(
        s.chatHistoryLimit === UNLIMITED_CONTEXT_VALUE &&
          s.sessionWindowHours === UNLIMITED_CONTEXT_VALUE
      );
      setRecoveryDiscountPercent(
        s.recoveryDiscountPercent != null
          ? String(s.recoveryDiscountPercent)
          : ""
      );
      setRecoveryBundleDiscountPercent(
        s.recoveryBundleDiscountPercent != null
          ? String(s.recoveryBundleDiscountPercent)
          : ""
      );
      setConversationReplyLimit(
        s.conversationReplyLimit != null
          ? String(s.conversationReplyLimit)
          : ""
      );
      setConversationReplyWindowHours(
        s.conversationReplyWindowHours != null
          ? String(s.conversationReplyWindowHours)
          : ""
      );
      setSuccess("AI settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveModes() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/store/ai-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappSalesInstructions: whatsappSalesInstructions || null,
          shopifyConfirmInstructions: shopifyConfirmInstructions || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSettings(data.settings);
      setWhatsappSalesInstructions(
        data.settings.whatsappSalesInstructions ?? ""
      );
      setShopifyConfirmInstructions(
        data.settings.shopifyConfirmInstructions ?? ""
      );
      setSuccess("Agent mode instructions saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
        Loading AI settings...
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 pt-4">
        <nav className="flex gap-6">
          {(
            [
              ["general", "General"],
              ["modes", "Agent modes"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`border-b-2 pb-3 text-sm font-semibold transition-colors ${
                tab === id
                  ? "border-emerald-500 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6 sm:p-8">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {success}
          </div>
        )}

        {tab === "general" && (
          <div>
            <div className="mb-6 flex items-start gap-2 text-sm text-slate-600">
              <span className="text-lg" aria-hidden>
                🤖
              </span>
              <p>
                How your AI agent introduces itself and replies on WhatsApp.
              </p>
            </div>

            {sendOpeningMessage &&
              (!settings?.agentName || !settings?.openingMessage) &&
              platformDefaults && (
                <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  <p className="font-semibold">Using platform defaults</p>
                  <p className="mt-0.5 text-xs text-blue-800/90">
                    Empty fields fall back to admin defaults
                    {platformDefaults.agentName
                      ? ` (agent: ${platformDefaults.agentName})`
                      : ""}
                    . Save your own values to override.
                  </p>
                </div>
              )}

            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-900">
                  AI Name
                </label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder={platformDefaults?.agentName || "e.g. Max"}
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Customers see this name when chatting.
                </p>
              </div>

              <div>
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sendOpeningMessage}
                    onClick={() => setSendOpeningMessage((v) => !v)}
                    className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
                      sendOpeningMessage ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        sendOpeningMessage ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      Send opening message
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {sendOpeningMessage
                        ? "New customers get your opening message on their first chat (uses your text below, or admin default if empty)."
                        : "Disabled — no opening message is sent, even if admin set a platform default."}
                    </p>
                  </div>
                </div>
              </div>

              <div className={sendOpeningMessage ? "" : "opacity-50"}>
                <label className="mb-1.5 block text-sm font-semibold text-slate-900">
                  Opening message
                </label>
                <textarea
                  value={openingMessage}
                  onChange={(e) => setOpeningMessage(e.target.value)}
                  rows={3}
                  disabled={!sendOpeningMessage}
                  placeholder={
                    platformDefaults?.openingMessage || DEFAULT_OPENING
                  }
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Sent to new customers on their first message when opening
                  messages are enabled. Use{" "}
                  <code className="rounded bg-slate-100 px-1">
                    {"{agent_name}"}
                  </code>{" "}
                  and{" "}
                  <code className="rounded bg-slate-100 px-1">
                    {"{store_name}"}
                  </code>
                  .
                </p>
                {sendOpeningMessage && !openingMessage && (
                  <button
                    type="button"
                    onClick={() => setOpeningMessage(DEFAULT_OPENING)}
                    className="mt-2 text-xs font-medium text-emerald-600 hover:underline"
                  >
                    Use suggested opening message
                  </button>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-900">
                  Reply length
                </label>
                <select
                  value={replyLength}
                  onChange={(e) =>
                    setReplyLength(e.target.value as AiReplyLength)
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                >
                  {REPLY_LENGTH_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-900">
                  Order confirmation (WhatsApp)
                </label>
                <select
                  value={whatsappOrderTemplateId ?? ""}
                  onChange={(e) =>
                    setWhatsappOrderTemplateId(e.target.value || null)
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">Default order confirmation</option>
                  {approvedWaTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.language}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-500">
                  Uses Meta-approved templates from{" "}
                  <Link
                    href="/dashboard/whatsapp-templates"
                    className="font-medium text-emerald-600 hover:underline"
                  >
                    WA Templates
                  </Link>
                  . Create and approve templates there.
                </p>
                {approvedWaTemplates.length === 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    No approved WhatsApp templates yet — add one under WA
                    Templates and wait for Meta approval.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Conversation memory
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  How much chat the AI remembers. Default is admin settings
                  {platformDefaults?.chatHistoryLimit === UNLIMITED_CONTEXT_VALUE
                    ? " (unlimited)"
                    : platformDefaults?.chatHistoryLimit != null
                      ? ` (${platformDefaults.chatHistoryLimit} msgs / ${platformDefaults.sessionWindowHours ?? 2}h)`
                      : ""}
                  . A short window can make the bot forget products mid-deal.
                </p>

                <div className="mt-3 flex items-start gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={unlimitedMemory}
                    onClick={() => setUnlimitedMemory((v) => !v)}
                    className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
                      unlimitedMemory ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        unlimitedMemory ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Unlimited memory
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Remember the full conversation — no fresh start mid-deal.
                      Recommended for sales chats.
                    </p>
                  </div>
                </div>

                {!unlimitedMemory && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">
                        Last messages (5–50)
                      </span>
                      <input
                        type="number"
                        min={5}
                        max={50}
                        value={chatHistoryLimit}
                        onChange={(e) => setChatHistoryLimit(e.target.value)}
                        placeholder={String(
                          platformDefaults?.chatHistoryLimit ===
                            UNLIMITED_CONTEXT_VALUE
                            ? 10
                            : (platformDefaults?.chatHistoryLimit ?? 10)
                        )}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">
                        Fresh start after (hours)
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={168}
                        value={sessionWindowHours}
                        onChange={(e) =>
                          setSessionWindowHours(e.target.value)
                        }
                        placeholder={String(
                          platformDefaults?.sessionWindowHours ===
                            UNLIMITED_CONTEXT_VALUE
                            ? 2
                            : (platformDefaults?.sessionWindowHours ?? 2)
                        )}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Sales recovery offers
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  When a customer says no after product details: first offer a
                  discount, then a 2-pack bundle. Empty = admin default
                  {platformDefaults?.recoveryDiscountPercent != null
                    ? ` (${platformDefaults.recoveryDiscountPercent}% / bundle ${platformDefaults.recoveryBundleDiscountPercent ?? 25}%)`
                    : ""}
                  .
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">
                      First “no” discount %
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={recoveryDiscountPercent}
                      onChange={(e) =>
                        setRecoveryDiscountPercent(e.target.value)
                      }
                      placeholder={String(
                        platformDefaults?.recoveryDiscountPercent ?? 15
                      )}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">
                      Bundle (2-pack) discount %
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={recoveryBundleDiscountPercent}
                      onChange={(e) =>
                        setRecoveryBundleDiscountPercent(e.target.value)
                      }
                      placeholder={String(
                        platformDefaults?.recoveryBundleDiscountPercent ?? 25
                      )}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  AI replies per chat (spam protection)
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  After this many AI replies in one conversation within the
                  window, the chat switches to Human and appears under “AI
                  exhausted”. Empty max = unlimited (or admin default).
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase text-slate-500">
                    Max AI replies
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={conversationReplyLimit}
                      onChange={(e) =>
                        setConversationReplyLimit(e.target.value)
                      }
                      placeholder={
                        platformDefaults?.conversationReplyLimit != null
                          ? String(platformDefaults.conversationReplyLimit)
                          : "Unlimited"
                      }
                      className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase text-slate-500">
                    Within (hours)
                    <select
                      value={conversationReplyWindowHours}
                      onChange={(e) =>
                        setConversationReplyWindowHours(e.target.value)
                      }
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                    >
                      <option value="">Whole chat (no time limit)</option>
                      <option value="1">1 hour</option>
                      <option value="2">2 hours</option>
                      <option value="6">6 hours</option>
                      <option value="12">12 hours</option>
                      <option value="24">24 hours</option>
                      <option value="48">48 hours</option>
                      <option value="72">72 hours</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setConversationReplyLimit("");
                      setConversationReplyWindowHours("");
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Unlimited
                  </button>
                </div>
                {conversationReplyLimit.trim() !== "" && (
                  <p className="mt-2 text-xs font-medium text-slate-700">
                    Current: {conversationReplyLimit} AI replies / chat
                    {conversationReplyWindowHours
                      ? ` every ${conversationReplyWindowHours} hour${
                          conversationReplyWindowHours === "1" ? "" : "s"
                        }`
                      : " (whole conversation)"}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-2 border-t border-slate-200 pt-6">
              <button
                type="button"
                onClick={resetGeneral}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={saveGeneral}
                disabled={saving}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        )}

        {tab === "modes" && (
          <div>
            <div className="mb-6 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Dual agent modes</p>
              <p className="mt-1">
                The AI picks WhatsApp sales mode for new leads and purchases,
                and Shopify confirmation mode when the customer asks about an
                existing Shopify order. Empty fields use the platform defaults.
              </p>
            </div>

            <div className="space-y-8">
              <div className="rounded-xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      WhatsApp sales instructions
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Used for WhatsApp leads and new purchases.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setWhatsappSalesInstructions(
                        DEFAULT_WHATSAPP_SALES_INSTRUCTIONS
                      )
                    }
                    className="text-xs font-medium text-emerald-600 hover:underline"
                  >
                    Reset to default
                  </button>
                </div>

                <textarea
                  value={whatsappSalesInstructions}
                  onChange={(e) => setWhatsappSalesInstructions(e.target.value)}
                  rows={8}
                  placeholder={DEFAULT_WHATSAPP_SALES_INSTRUCTIONS}
                  className="mt-3 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div className="rounded-xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Shopify confirmation instructions
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Used when customers ask about an existing Shopify order.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setShopifyConfirmInstructions(
                        DEFAULT_SHOPIFY_CONFIRM_INSTRUCTIONS
                      )
                    }
                    className="text-xs font-medium text-emerald-600 hover:underline"
                  >
                    Reset to default
                  </button>
                </div>

                <textarea
                  value={shopifyConfirmInstructions}
                  onChange={(e) =>
                    setShopifyConfirmInstructions(e.target.value)
                  }
                  rows={8}
                  placeholder={DEFAULT_SHOPIFY_CONFIRM_INSTRUCTIONS}
                  className="mt-3 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-2 border-t border-slate-200 pt-6">
              <button
                type="button"
                onClick={resetModes}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={saveModes}
                disabled={saving}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
