"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/currency";
import type { AdWhatsAppLink } from "@/lib/ads/types";

type ListProduct = {
  id: number;
  title: string;
  handle: string | null;
  status: string | null;
  vendor: string | null;
  productType: string | null;
  description: string | null;
  imageUrl: string | null;
  priceFrom: string | null;
  currency: string | null;
  totalInventory: number | null;
  variantCount: number;
};

type ProductDetail = {
  id: number;
  title: string;
  handle: string | null;
  status: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  description: string | null;
  images: Array<{ url: string; alt: string | null }>;
  variants: Array<{
    id: number;
    title: string;
    sku: string | null;
    price: string;
    compareAtPrice: string | null;
    inventoryQuantity: number;
    inStock: boolean;
    barcode: string | null;
  }>;
  createdAt: string | null;
  updatedAt: string | null;
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

export function ShopifyProductsPanel() {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [products, setProducts] = useState<ListProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [previousCursor, setPreviousCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [existingLink, setExistingLink] = useState<AdWhatsAppLink | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
    null
  );
  const [generating, setGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<AdWhatsAppLink | null>(
    null
  );

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProducts = useCallback(
    async (opts: {
      q?: string;
      cursor?: string | null;
      direction?: "next" | "prev";
      pageNum?: number;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (opts.q) params.set("q", opts.q);
        if (opts.cursor) params.set("cursor", opts.cursor);
        if (opts.direction) params.set("direction", opts.direction);

        const res = await fetch(`/api/store/shopify-products?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load products");

        setProducts(data.products ?? []);
        setCurrency(data.currency ?? "USD");
        setWhatsappConnected(Boolean(data.whatsappConnected));
        setHasNextPage(Boolean(data.hasNextPage));
        setHasPreviousPage(Boolean(data.hasPreviousPage));
        setNextCursor(data.nextCursor ?? null);
        setPreviousCursor(data.previousCursor ?? null);
        if (opts.pageNum != null) setPage(opts.pageNum);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load products");
        setProducts([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadProducts({ pageNum: 1 });
  }, [loadProducts]);

  function onSearchChange(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const q = value.trim();
      setAppliedQuery(q);
      loadProducts({ q: q || undefined, pageNum: 1 });
    }, 400);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    setAppliedQuery(q);
    loadProducts({ q: q || undefined, pageNum: 1 });
  }

  async function openProduct(id: number) {
    setSelectedId(id);
    setDetail(null);
    setExistingLink(null);
    setGeneratedLink(null);
    setDetailLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/store/shopify-products/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load product");

      setDetail(data.product);
      setExistingLink(data.existingLink ?? null);
      setWhatsappConnected(Boolean(data.whatsappConnected));
      if (data.currency) setCurrency(data.currency);
      setSelectedVariantId(data.product?.variants?.[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product");
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
    setExistingLink(null);
    setGeneratedLink(null);
  }

  async function generateLink() {
    if (!detail) return;
    if (!whatsappConnected) {
      setError("Connect WhatsApp in Integrations to generate ad links.");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/store/ad-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: detail.id,
          variantId: selectedVariantId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate link");

      setGeneratedLink(data.link);
      setExistingLink(data.link);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate link");
    } finally {
      setGenerating(false);
    }
  }

  const activeLink = generatedLink ?? existingLink;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Shopify products
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Browse your catalog, open a product for full details, and generate
              a WhatsApp ad link to copy for Meta ads.
            </p>
          </div>
          {!whatsappConnected && (
            <Link
              href="/dashboard/integrations/whatsapp"
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Connect WhatsApp to generate links
            </Link>
          )}
        </div>

        <form onSubmit={submitSearch} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            value={query}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search product by name..."
            className="flex-1 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Search
          </button>
        </form>

        {error && !selectedId && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-5">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Loading products...
            </p>
          ) : products.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              {appliedQuery
                ? `No products match “${appliedQuery}”.`
                : "No active Shopify products found."}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => openProduct(product.id)}
                  className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-emerald-300 hover:shadow-sm"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">
                      {product.title}
                    </p>
                    {product.vendor && (
                      <p className="truncate text-xs text-slate-500">
                        {product.vendor}
                        {product.productType ? ` · ${product.productType}` : ""}
                      </p>
                    )}
                    {product.priceFrom && (
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        From{" "}
                        {formatMoney(
                          parseFloat(product.priceFrom),
                          product.currency ?? currency
                        )}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {product.variantCount} variant
                      {product.variantCount === 1 ? "" : "s"}
                      {product.totalInventory != null
                        ? ` · ${product.totalInventory} in stock`
                        : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {(hasNextPage || hasPreviousPage) && (
          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500">
              Page {page} · 25 per page
              {appliedQuery ? ` · filtered by “${appliedQuery}”` : ""}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!hasPreviousPage || loading}
                onClick={() =>
                  loadProducts({
                    q: appliedQuery || undefined,
                    cursor: previousCursor,
                    direction: "prev",
                    pageNum: Math.max(1, page - 1),
                  })
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!hasNextPage || loading}
                onClick={() =>
                  loadProducts({
                    q: appliedQuery || undefined,
                    cursor: nextCursor,
                    direction: "next",
                    pageNum: page + 1,
                  })
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
          onClick={closeDetail}
        >
          <div
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {detail?.title ?? "Product details"}
                </h3>
                {detail?.handle && (
                  <p className="text-xs text-slate-500">/{detail.handle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-5 px-5 py-5">
              {detailLoading || !detail ? (
                <p className="text-sm text-slate-500">Loading details...</p>
              ) : (
                <>
                  {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      {error}
                    </div>
                  )}

                  {detail.images[0] && (
                    <div className="overflow-hidden rounded-xl bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={detail.images[0].url}
                        alt={detail.images[0].alt ?? detail.title}
                        className="max-h-64 w-full object-contain"
                      />
                    </div>
                  )}

                  {detail.images.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto">
                      {detail.images.slice(1, 8).map((img) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={img.url}
                          src={img.url}
                          alt={img.alt ?? ""}
                          className="h-14 w-14 shrink-0 rounded-lg object-cover"
                        />
                      ))}
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Meta label="Status" value={detail.status ?? "—"} />
                    <Meta label="Vendor" value={detail.vendor ?? "—"} />
                    <Meta
                      label="Product type"
                      value={detail.productType ?? "—"}
                    />
                    <Meta
                      label="Variants"
                      value={String(detail.variants.length)}
                    />
                  </div>

                  {detail.tags.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase text-slate-500">
                        Tags
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {detail.description && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase text-slate-500">
                        Description
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-slate-700">
                        {detail.description}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                      Variants
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                            <th className="px-3 py-2">Variant</th>
                            <th className="px-3 py-2">SKU</th>
                            <th className="px-3 py-2">Price</th>
                            <th className="px-3 py-2">Stock</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detail.variants.map((v) => (
                            <tr key={v.id}>
                              <td className="px-3 py-2 font-medium text-slate-900">
                                {v.title}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {v.sku || "—"}
                              </td>
                              <td className="px-3 py-2 text-slate-800">
                                {formatMoney(parseFloat(v.price), currency)}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {v.inventoryQuantity}
                                {!v.inStock && (
                                  <span className="ml-1 text-xs text-amber-700">
                                    (out)
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-900">
                      WhatsApp ad link
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Generate a tracking link for Meta ads. WhatsApp must be
                      connected.
                    </p>

                    {detail.variants.length > 1 && (
                      <label className="mt-3 block text-xs font-medium text-slate-600">
                        Variant for ad
                        <select
                          value={selectedVariantId ?? ""}
                          onChange={(e) =>
                            setSelectedVariantId(Number(e.target.value))
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          {detail.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.title} —{" "}
                              {formatMoney(parseFloat(v.price), currency)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={generateLink}
                        disabled={generating || !whatsappConnected}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {generating
                          ? "Generating..."
                          : activeLink
                            ? "Generate new link"
                            : "Generate link"}
                      </button>
                      {!whatsappConnected && (
                        <Link
                          href="/dashboard/integrations/whatsapp"
                          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"
                        >
                          Connect WhatsApp
                        </Link>
                      )}
                    </div>

                    {activeLink?.whatsapp_url && (
                      <div className="mt-4 space-y-3">
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                            WhatsApp URL
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="block max-w-full flex-1 overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs text-slate-800">
                              {activeLink.whatsapp_url}
                            </code>
                            <CopyButton
                              text={activeLink.whatsapp_url}
                              label="Copy link"
                            />
                          </div>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                            Pre-filled message
                          </p>
                          <div className="flex flex-wrap items-start gap-2">
                            <p className="flex-1 rounded-lg bg-white px-3 py-2 text-sm text-slate-800">
                              {activeLink.prefill_message}
                            </p>
                            <CopyButton
                              text={activeLink.prefill_message}
                              label="Copy message"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-slate-500">
                          Clicks tracked: {activeLink.click_count}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium capitalize text-slate-900">
        {value}
      </p>
    </div>
  );
}
