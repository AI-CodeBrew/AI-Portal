"use client";

import { useCallback, useEffect, useState } from "react";
import type { WhatsappConversation } from "@/lib/types";

type CatalogProduct = {
  key: string;
  source: "portal" | "shopify";
  id: string;
  title: string;
  sku: string | null;
  price: string;
  currency: string;
  imageUrl: string | null;
  variants: Array<{
    id: string;
    title: string;
    sku: string | null;
    price: string;
    priceFormatted?: string;
  }>;
};

type OrderPreview = {
  ready: boolean;
  missing: Array<"phone" | "address" | "product">;
  issues: string[];
  product: {
    title: string;
    sku: string | null;
    variantId: string | null;
    productId: string | null;
    priceFormatted: string | null;
    imageUrl: string | null;
  } | null;
  shipping: {
    customerName: string;
    phone: string;
    address1: string;
    city: string;
  } | null;
  quantity: number;
  discountPercent: number | null;
};

export function InboxManualTools({
  conversation,
  windowOpen,
  busy,
  onBusyChange,
  onSent,
  onError,
}: {
  conversation: WhatsappConversation;
  windowOpen: boolean;
  busy: boolean;
  onBusyChange: (v: boolean) => void;
  onSent: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [modal, setModal] = useState<"products" | "order" | null>(null);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address1, setAddress1] = useState("");
  const [city, setCity] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [placing, setPlacing] = useState(false);
  const [variantLoading, setVariantLoading] = useState(false);

  const closeModal = useCallback(() => {
    setModal(null);
  }, []);

  const loadProducts = useCallback(
    async (search: string) => {
      setProductsLoading(true);
      try {
        const params = new URLSearchParams({ limit: "10" });
        if (search.trim()) params.set("q", search.trim());
        const res = await fetch(`/api/inbox/products?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Product search failed"
          );
        }
        setProducts(Array.isArray(data.products) ? data.products : []);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Product search failed");
      } finally {
        setProductsLoading(false);
      }
    },
    [onError]
  );

  const loadShopifyVariants = useCallback(
    async (productId: string) => {
      setVariantLoading(true);
      try {
        const res = await fetch(
          `/api/inbox/products?shopifyProductId=${encodeURIComponent(productId)}`
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "Could not load product variants"
          );
        }
        const full = Array.isArray(data.products)
          ? (data.products[0] as CatalogProduct | undefined)
          : undefined;
        if (full) {
          setProducts((prev) =>
            prev.map((p) =>
              p.source === "shopify" && p.id === productId ? full : p
            )
          );
          setSelectedVariantId(
            full.variants.length === 1 ? full.variants[0]!.id : ""
          );
        }
      } catch (err) {
        onError(
          err instanceof Error ? err.message : "Could not load product variants"
        );
      } finally {
        setVariantLoading(false);
      }
    },
    [onError]
  );

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/inbox/order-preview?conversationId=${encodeURIComponent(conversation.id)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Could not load order preview"
        );
      }
      const next = data.preview as OrderPreview;
      setPreview(next);
      setCustomerName(next.shipping?.customerName ?? "");
      setPhone(next.shipping?.phone ?? "");
      setAddress1(next.shipping?.address1 ?? "");
      setCity(next.shipping?.city ?? "");
      setQuantity(next.quantity > 0 ? next.quantity : 1);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not load order preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [conversation.id, onError]);

  useEffect(() => {
    if (modal !== "products") return;
    const timer = setTimeout(() => {
      void loadProducts(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, modal, loadProducts]);

  useEffect(() => {
    if (modal === "order") {
      void loadPreview();
    }
  }, [modal, loadPreview]);

  useEffect(() => {
    setQuery("");
    setProducts([]);
    setSelectedKey("");
    setSelectedVariantId("");
    setPreview(null);
    setModal(null);
  }, [conversation.id]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    if (modal) {
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
  }, [modal, closeModal]);

  const selectedProduct = products.find((p) => p.key === selectedKey);

  async function selectProduct(product: CatalogProduct) {
    setSelectedKey(product.key);
    if (product.source === "shopify" && product.variants.length === 0) {
      setSelectedVariantId("");
      await loadShopifyVariants(product.id);
      return;
    }
    setSelectedVariantId(
      product.variants.length === 1 ? product.variants[0]!.id : ""
    );
  }

  async function sendProduct() {
    if (!selectedProduct) {
      onError("Select a product to send");
      return;
    }
    onBusyChange(true);
    onError(null);
    try {
      const res = await fetch("/api/inbox/send-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversation.id,
          source: selectedProduct.source,
          productId: selectedProduct.id,
          variantId: selectedVariantId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to send product"
        );
      }
      closeModal();
      await onSent();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to send product");
    } finally {
      onBusyChange(false);
    }
  }

  async function placeOrder() {
    onError(null);
    setPlacing(true);
    onBusyChange(true);
    try {
      const res = await fetch("/api/inbox/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversation.id,
          customerName: customerName.trim() || undefined,
          phone: phone.trim() || undefined,
          address1: address1.trim() || undefined,
          city: city.trim() || undefined,
          quantity,
          variantId: preview?.product?.variantId || undefined,
          productId: preview?.product?.productId || undefined,
          sku: preview?.product?.sku || undefined,
          discountPercent: preview?.discountPercent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to place order"
        );
      }
      closeModal();
      await onSent();
      if (data.whatsappSent === false) {
        onError(
          typeof data.whatsappError === "string"
            ? `Order placed, but WhatsApp confirmation failed: ${data.whatsappError}`
            : "Order placed, but WhatsApp confirmation could not be sent. Use Follow up or a template."
        );
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setPlacing(false);
      onBusyChange(false);
    }
  }

  if (!windowOpen) return null;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-violet-900">Agent tools</span>
        <button
          type="button"
          onClick={() => setModal("products")}
          className="rounded-md border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-900 hover:bg-violet-50"
        >
          Send product
        </button>
        <button
          type="button"
          onClick={() => setModal("order")}
          className="rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-50"
        >
          Place order
        </button>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close agent tools"
            className="absolute inset-0 bg-slate-900/30"
            onClick={closeModal}
          />
          <div className="relative z-10 flex max-h-[min(70vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {modal === "products" ? "Send product card" : "Place order"}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {modal === "products" && (
                <div className="space-y-3">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search portal + Shopify by name or SKU..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
                    autoFocus
                  />
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1">
                    {productsLoading ? (
                      <p className="px-2 py-3 text-xs text-slate-500">Searching...</p>
                    ) : products.length === 0 ? (
                      <p className="px-2 py-3 text-xs text-slate-500">
                        No products found in portal or Shopify.
                      </p>
                    ) : (
                      products.map((product) => (
                        <button
                          key={product.key}
                          type="button"
                          onClick={() => void selectProduct(product)}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-violet-50 ${
                            selectedKey === product.key
                              ? "bg-violet-100 ring-1 ring-violet-300"
                              : ""
                          }`}
                        >
                          {product.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.imageUrl}
                              alt=""
                              className="h-10 w-10 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-500">
                              No img
                            </div>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-medium text-slate-900">
                                {product.title}
                              </span>
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                  product.source === "shopify"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {product.source}
                              </span>
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              {product.sku ?? "Shopify"}
                              {" · "}
                              {product.currency} {product.price}
                            </span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>

                  {variantLoading && (
                    <p className="text-xs text-slate-500">Loading variants...</p>
                  )}

                  {selectedProduct && selectedProduct.variants.length > 1 && (
                    <select
                      value={selectedVariantId}
                      onChange={(e) => setSelectedVariantId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none"
                    >
                      <option value="">Select variant...</option>
                      {selectedProduct.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.title}
                          {variant.priceFormatted
                            ? ` · ${variant.priceFormatted}`
                            : variant.price
                              ? ` · ${variant.price}`
                              : ""}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={() => void sendProduct()}
                    disabled={
                      busy ||
                      variantLoading ||
                      !selectedProduct ||
                      (selectedProduct.variants.length > 1 && !selectedVariantId)
                    }
                    className="w-full rounded-lg bg-violet-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
                  >
                    Send product card + image
                  </button>
                </div>
              )}

              {modal === "order" && (
                <div className="space-y-3">
                  {previewLoading ? (
                    <p className="text-xs text-slate-600">
                      Loading order details from chat...
                    </p>
                  ) : (
                    <>
                      {preview?.product ? (
                        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                          {preview.product.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={preview.product.imageUrl}
                              alt=""
                              className="h-12 w-12 rounded object-cover"
                            />
                          ) : null}
                          <div className="min-w-0 text-sm">
                            <p className="font-medium text-slate-900">
                              {preview.product.title}
                            </p>
                            <p className="text-xs text-slate-500">
                              {preview.product.sku ?? "No SKU"}
                              {preview.product.priceFormatted
                                ? ` · ${preview.product.priceFormatted}`
                                : ""}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          No product detected in chat yet. Send a product card first.
                        </p>
                      )}

                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block text-xs text-slate-600">
                          Customer name
                          <input
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                          />
                        </label>
                        <label className="block text-xs text-slate-600">
                          Phone *
                          <input
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                          />
                        </label>
                        <label className="block text-xs text-slate-600 sm:col-span-2">
                          Delivery address *
                          <input
                            value={address1}
                            onChange={(e) => setAddress1(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                          />
                        </label>
                        <label className="block text-xs text-slate-600">
                          City
                          <input
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                          />
                        </label>
                        <label className="block text-xs text-slate-600">
                          Quantity
                          <input
                            type="number"
                            min={1}
                            value={quantity}
                            onChange={(e) =>
                              setQuantity(Math.max(1, Number(e.target.value) || 1))
                            }
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                          />
                        </label>
                      </div>

                      {preview?.discountPercent ? (
                        <p className="text-xs text-emerald-700">
                          Recovery discount: {preview.discountPercent}% off
                        </p>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void placeOrder()}
                          disabled={
                            placing ||
                            busy ||
                            !preview?.product ||
                            !phone.trim() ||
                            !address1.trim()
                          }
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {placing ? "Placing order..." : "Confirm & place order"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void loadPreview()}
                          disabled={previewLoading}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Refresh from chat
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
