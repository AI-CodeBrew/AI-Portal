"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SHOPIFY_CONFIRM_INSTRUCTIONS,
  DEFAULT_WHATSAPP_SALES_INSTRUCTIONS,
  REPLY_LENGTH_OPTIONS,
  TEMPLATE_CATEGORY_LABELS,
  type AiPromptTemplate,
  type AiReplyLength,
  type AiTemplateCategory,
  type StoreAiSettings,
} from "@/lib/ai/ai-settings-types";
import type { WhatsAppMessageTemplate } from "@/lib/whatsapp/message-templates";

type TabId = "general" | "modes" | "templates";

const DEFAULT_OPENING =
  "Hi! Welcome to {store_name} 👋 I'm {agent_name}. How can I help you today?";

const TEMPLATE_CATEGORY_OPTIONS: AiTemplateCategory[] = [
  "order_creation",
  "general",
  "product_inquiry",
  "support",
  "whatsapp_sales",
  "shopify_confirmation",
];

export function AiSettingsPanel() {
  const [tab, setTab] = useState<TabId>("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settings, setSettings] = useState<StoreAiSettings | null>(null);
  const [templates, setTemplates] = useState<AiPromptTemplate[]>([]);
  const [approvedWaTemplates, setApprovedWaTemplates] = useState<
    WhatsAppMessageTemplate[]
  >([]);
  const [platformDefaults, setPlatformDefaults] =
    useState<StoreAiSettings | null>(null);

  const [agentName, setAgentName] = useState("");
  const [openingMessage, setOpeningMessage] = useState("");
  const [replyLength, setReplyLength] = useState<AiReplyLength>("medium");
  const [orderTemplateId, setOrderTemplateId] = useState<string | null>(null);
  const [whatsappOrderTemplateId, setWhatsappOrderTemplateId] = useState<
    string | null
  >(null);

  const [whatsappSalesInstructions, setWhatsappSalesInstructions] =
    useState("");
  const [shopifyConfirmInstructions, setShopifyConfirmInstructions] =
    useState("");

  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AiPromptTemplate | null>(
    null
  );
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateCategory, setTemplateCategory] =
    useState<AiTemplateCategory>("order_creation");
  const [templateContent, setTemplateContent] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/store/ai-settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load settings");

      const s = data.settings as StoreAiSettings;
      setSettings(s);
      setTemplates(data.templates ?? []);
      setApprovedWaTemplates(data.approvedWhatsAppTemplates ?? []);
      setPlatformDefaults(data.platformDefaults ?? null);
      setAgentName(s.agentName ?? "");
      setOpeningMessage(s.openingMessage ?? "");
      setReplyLength(s.replyLength ?? "medium");
      setOrderTemplateId(s.orderTemplateId);
      setWhatsappOrderTemplateId(s.whatsappOrderTemplateId ?? null);
      setWhatsappSalesInstructions(s.whatsappSalesInstructions ?? "");
      setShopifyConfirmInstructions(s.shopifyConfirmInstructions ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const whatsappSalesPresets = useMemo(
    () => templates.filter((t) => t.category === "whatsapp_sales"),
    [templates]
  );
  const shopifyConfirmPresets = useMemo(
    () => templates.filter((t) => t.category === "shopify_confirmation"),
    [templates]
  );

  function resetGeneral() {
    if (!settings) return;
    setAgentName(settings.agentName ?? "");
    setOpeningMessage(settings.openingMessage ?? "");
    setReplyLength(settings.replyLength ?? "medium");
    setOrderTemplateId(settings.orderTemplateId);
    setWhatsappOrderTemplateId(settings.whatsappOrderTemplateId ?? null);
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
          openingMessage: openingMessage || null,
          replyLength,
          orderTemplateId: orderTemplateId || null,
          whatsappOrderTemplateId: whatsappOrderTemplateId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSettings(data.settings);
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

  function applyPresetToField(
    templateId: string,
    presets: AiPromptTemplate[],
    setter: (value: string) => void
  ) {
    if (!templateId) return;
    const tpl = presets.find((t) => t.id === templateId);
    if (tpl) setter(tpl.prompt_content);
  }

  function openCreateTemplate() {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateDescription("");
    setTemplateCategory("order_creation");
    setTemplateContent("");
    setShowCreateTemplate(true);
  }

  function openEditTemplate(template: AiPromptTemplate) {
    if (template.isPredefined) return;
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateDescription(template.description ?? "");
    setTemplateCategory(template.category);
    setTemplateContent(template.prompt_content);
    setShowCreateTemplate(true);
  }

  async function saveTemplate() {
    setTemplateSaving(true);
    setError(null);
    try {
      const url = editingTemplate
        ? `/api/store/ai-templates/${editingTemplate.id}`
        : "/api/store/ai-templates";
      const res = await fetch(url, {
        method: editingTemplate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          description: templateDescription || null,
          category: templateCategory,
          promptContent: templateContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");

      await load();
      setShowCreateTemplate(false);
      setSuccess(
        editingTemplate ? "Template updated." : "Custom template created."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setTemplateSaving(false);
    }
  }

  async function applyTemplateSelection(templateId: string) {
    setError(null);
    setSuccess(null);
    setOrderTemplateId(templateId);
    setWhatsappOrderTemplateId(null);

    try {
      const res = await fetch("/api/store/ai-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderTemplateId: templateId,
          whatsappOrderTemplateId: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSettings(data.settings);
      setSuccess("Template selected for order creation.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function deleteTemplate(template: AiPromptTemplate) {
    if (template.isPredefined) return;
    if (!confirm(`Delete template "${template.name}"?`)) return;

    setError(null);
    try {
      const res = await fetch(`/api/store/ai-templates/${template.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      await load();
      setSuccess("Template deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const customTemplates = templates.filter((t) => !t.isPredefined);

  /** Combined select value: ai:uuid | wa:uuid | "" */
  const orderSelectValue = whatsappOrderTemplateId
    ? `wa:${whatsappOrderTemplateId}`
    : customTemplates.some((t) => t.id === orderTemplateId)
      ? `ai:${orderTemplateId}`
      : "";

  function onOrderSelectChange(value: string) {
    if (!value) {
      setOrderTemplateId(null);
      setWhatsappOrderTemplateId(null);
      return;
    }
    if (value.startsWith("wa:")) {
      setWhatsappOrderTemplateId(value.slice(3));
      setOrderTemplateId(null);
      return;
    }
    if (value.startsWith("ai:")) {
      setOrderTemplateId(value.slice(3));
      setWhatsappOrderTemplateId(null);
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
              ["templates", "Templates"],
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

            {(!settings?.agentName || !settings?.openingMessage) &&
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
                  placeholder={
                    platformDefaults?.agentName || "e.g. Max"
                  }
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Customers see this name when chatting.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-900">
                  Opening message
                </label>
                <textarea
                  value={openingMessage}
                  onChange={(e) => setOpeningMessage(e.target.value)}
                  rows={3}
                  placeholder={
                    platformDefaults?.openingMessage || DEFAULT_OPENING
                  }
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Sent to new customers on their first message. Use{" "}
                  <code className="rounded bg-slate-100 px-1">{"{agent_name}"}</code>{" "}
                  and{" "}
                  <code className="rounded bg-slate-100 px-1">{"{store_name}"}</code>.
                </p>
                {!openingMessage && (
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
                  Order creation template
                </label>
                <select
                  value={orderSelectValue}
                  onChange={(e) => onOrderSelectChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">Platform default</option>
                  {customTemplates.length > 0 && (
                    <optgroup label="Your AI templates">
                      {customTemplates.map((t) => (
                        <option key={t.id} value={`ai:${t.id}`}>
                          {t.name} ({TEMPLATE_CATEGORY_LABELS[t.category]})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {approvedWaTemplates.length > 0 && (
                    <optgroup label="Meta approved (WhatsApp)">
                      {approvedWaTemplates.map((t) => (
                        <option key={t.id} value={`wa:${t.id}`}>
                          {t.name} · {t.language}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="mt-1.5 text-xs text-slate-500">
                  Choose a custom AI template you created, or a Meta-approved
                  WhatsApp template for order confirmation messages. Create
                  WhatsApp templates under WA Templates.
                </p>
                {customTemplates.length === 0 &&
                  approvedWaTemplates.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      No templates yet — create one in the Templates tab, or
                      submit a WhatsApp template and wait for Meta approval.
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
                <h3 className="text-sm font-bold text-slate-900">
                  WhatsApp sales instructions
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Used for WhatsApp leads and new purchases.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Use saved default
                  </label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      applyPresetToField(
                        e.target.value,
                        whatsappSalesPresets,
                        setWhatsappSalesInstructions
                      );
                      e.target.value = "";
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800"
                  >
                    <option value="">Choose preset…</option>
                    {whatsappSalesPresets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.isPredefined ? " (platform)" : ""}
                      </option>
                    ))}
                  </select>
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
                <h3 className="text-sm font-bold text-slate-900">
                  Shopify confirmation instructions
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Used when customers ask about an existing Shopify order.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Use saved default
                  </label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      applyPresetToField(
                        e.target.value,
                        shopifyConfirmPresets,
                        setShopifyConfirmInstructions
                      );
                      e.target.value = "";
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800"
                  >
                    <option value="">Choose preset…</option>
                    {shopifyConfirmPresets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.isPredefined ? " (platform)" : ""}
                      </option>
                    ))}
                  </select>
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

        {tab === "templates" && (
          <div>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-600">
                  Create custom instructions for order creation, tone, WhatsApp
                  sales, Shopify confirmation, and more. Leave unset to use the
                  platform defaults.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateTemplate}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
              >
                + Create custom template
              </button>
            </div>

            <section>
              <h3 className="text-sm font-bold text-slate-900">
                Your custom templates
              </h3>
              {customTemplates.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  No custom templates yet. Create one for your store&apos;s
                  order flow or tone.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {customTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {template.name}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {TEMPLATE_CATEGORY_LABELS[template.category]}
                          </p>
                          {template.description && (
                            <p className="mt-2 text-sm text-slate-600">
                              {template.description}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openEditTemplate(template)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTemplate(template)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {(template.category === "order_creation" ||
                        template.category === "general" ||
                        template.category === "product_inquiry" ||
                        template.category === "support") && (
                        <button
                          type="button"
                          onClick={() => applyTemplateSelection(template.id)}
                          className="mt-3 text-xs font-semibold text-emerald-600 hover:underline"
                        >
                          Use for order creation →
                        </button>
                      )}
                      {template.category === "whatsapp_sales" && (
                        <button
                          type="button"
                          onClick={() => {
                            setWhatsappSalesInstructions(
                              template.prompt_content
                            );
                            setTab("modes");
                            setSuccess(
                              "Copied into WhatsApp sales instructions — save on Agent modes."
                            );
                          }}
                          className="mt-3 text-xs font-semibold text-emerald-600 hover:underline"
                        >
                          Use for WhatsApp sales →
                        </button>
                      )}
                      {template.category === "shopify_confirmation" && (
                        <button
                          type="button"
                          onClick={() => {
                            setShopifyConfirmInstructions(
                              template.prompt_content
                            );
                            setTab("modes");
                            setSuccess(
                              "Copied into Shopify confirmation instructions — save on Agent modes."
                            );
                          }}
                          className="mt-3 text-xs font-semibold text-emerald-600 hover:underline"
                        >
                          Use for Shopify confirmation →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {showCreateTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              {editingTemplate ? "Edit template" : "Create custom template"}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Write instructions for how your AI should behave. These are added
              to the agent&apos;s system prompt.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-900">
                  Name
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-900">
                  Category
                </label>
                <select
                  value={templateCategory}
                  onChange={(e) =>
                    setTemplateCategory(e.target.value as AiTemplateCategory)
                  }
                  disabled={Boolean(editingTemplate)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50"
                >
                  {TEMPLATE_CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {TEMPLATE_CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-900">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-900">
                  Instructions
                </label>
                <textarea
                  value={templateContent}
                  onChange={(e) => setTemplateContent(e.target.value)}
                  rows={8}
                  placeholder="e.g. Always ask for delivery address before creating an order..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateTemplate(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveTemplate}
                disabled={
                  templateSaving ||
                  !templateName.trim() ||
                  !templateContent.trim()
                }
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {templateSaving ? "Saving..." : "Save template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
