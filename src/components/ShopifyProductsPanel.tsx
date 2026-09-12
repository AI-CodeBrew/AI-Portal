"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/currency";
import {
  cachedJsonFetch,
  invalidateCachedJson,
  peekCachedJson,
  setCachedJson,
} from "@/lib/client-fetch-cache";
import { createClient } from "@/lib/supabase/client";
import { useStoreStatus } from "@/hooks/useStoreStatus";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

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
    barcode: string | null;
  }>;
  createdAt: string | null;
  updatedAt: string | null;
};

type ShopifyListPayload = {
  products?: ListProduct[];
  currency?: string;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  totalCount?: number;
  connected?: boolean;
  lastSyncedAt?: string | null;
  syncing?: boolean;
  error?: string;
};

function mapCacheRowToListProduct(row: Record<string, unknown>): ListProduct {
  return {
    id: Number(row.id),
    title: String(row.title ?? ""),
    handle: (row.handle as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    vendor: (row.vendor as string | null) ?? null,
    productType: (row.product_type as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    priceFrom: (row.price_from as string | null) ?? null,
    currency: (row.currency as string | null) ?? null,
    variantCount: Number(row.variant_count ?? 1),
  };
}

function shopifyProductsKey(q: string, pageNum: number, limit: number) {
  return `shopify-products:${q}:${pageNum}:${limit}`;
}

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

function pageWindow(current: number, total: number): number[] {
  if (total <= 1) return total === 1 ? [1] : [];
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);
  return pages;
}

export function ShopifyProductsPanel() {
  const { store } = useStoreStatus();
  const storeId = store?.id ?? null;
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [connected, setConnected] = useState(Boolean(store?.shopify_connected));
  const [syncingRemote, setSyncingRemote] = useState(false);
  const selectedIdRef = useRef<number | null>(null);
  const initialShopify = peekCachedJson<ShopifyListPayload>(
    shopifyProductsKey("", 1, 10)
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    initialShopify?.lastSyncedAt ?? null
  );
  const [products, setProducts] = useState<ListProduct[]>(
    initialShopify?.products ?? []
  );
  const [loading, setLoading] = useState(!initialShopify?.products);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(
    10
  );
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const initialLoadDoneRef = useRef(false);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
    null
  );
  const [fetchingSku, setFetchingSku] = useState(false);
  const [portalSku, setPortalSku] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = useMemo(() => {
    if (totalCount == null || totalCount <= 0) return null;
    return Math.max(1, Math.ceil(totalCount / pageSize));
  }, [totalCount, pageSize]);

  const [syncing, setSyncing] = useState(false);

  const loadProducts = useCallback(
    async (opts: {
      q?: string;
      pageNum?: number;
      limit?: number;
      force?: boolean;
    }) => {
      const lim = opts.limit ?? pageSize;
      const pg = opts.pageNum ?? 1;
      const params = new URLSearchParams();
      if (opts.q) params.set("q", opts.q);
      params.set("limit", String(lim));
      params.set("page", String(pg));
      const cacheKey = shopifyProductsKey(opts.q ?? "", pg, lim);
      const hit = peekCachedJson<ShopifyListPayload>(cacheKey);
      if (hit?.products && !opts.force) {
        setProducts(hit.products);
        setCurrency(hit.currency ?? "USD");
        setHasNextPage(Boolean(hit.hasNextPage));
        setHasPreviousPage(Boolean(hit.hasPreviousPage));
        setTotalCount(
          typeof hit.totalCount === "number" ? hit.totalCount : null
        );
        if (typeof hit.connected === "boolean") setConnected(hit.connected);
        setSyncingRemote(Boolean(hit.syncing));
        if (hit.lastSyncedAt) setLastSyncedAt(hit.lastSyncedAt);
        setPage(pg);
        setLoading(false);
        return;
      } else if (!hit?.products) {
        setLoading(true);
      }
      setError(null);
      try {
        const { data } = await cachedJsonFetch<ShopifyListPayload>(
          cacheKey,
          `/api/store/shopify-products?${params}`,
          {
            ttlMs: 24 * 60 * 60_000,
            staleWhileRevalidate: false,
            force: opts.force ?? false,
          }
        );
        if (data.error) throw new Error(data.error);

        setProducts(data.products ?? []);
        setCurrency(data.currency ?? "USD");
        setHasNextPage(Boolean(data.hasNextPage));
        setHasPreviousPage(Boolean(data.hasPreviousPage));
        setTotalCount(
          typeof data.totalCount === "number" ? data.totalCount : null
        );
        setConnected(Boolean(data.connected));
        setSyncingRemote(Boolean(data.syncing));
        setLastSyncedAt(data.lastSyncedAt ?? null);
        setPage(pg);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load products");
        if (!hit?.products) setProducts([]);
      } finally {
        setLoading(false);
      }
    },
    [pageSize]
  );

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/store/shopify-products/sync", {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        lastSyncedAt?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Sync failed");
      }
      setLastSyncedAt(data.lastSyncedAt ?? new Date().toISOString());
      invalidateCachedJson("shopify-products:");
      await loadProducts({
        q: appliedQuery || undefined,
        pageNum: 1,
        force: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [loadProducts, appliedQuery]);

  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    loadProducts({ pageNum: 1, limit: pageSize });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const autoSyncStarted = useRef(false);
  useEffect(() => {
    if (autoSyncStarted.current) return;
    if (!connected || loading || lastSyncedAt || products.length > 0) return;
    autoSyncStarted.current = true;
    void handleSync();
  }, [connected, products.length, loading, lastSyncedAt, handleSync]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!storeId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`shopify-products-cache-${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shopify_products_cache",
          filter: `store_id=eq.${storeId}`,
        },
        (payload) => {
          const event = payload.eventType;
          const nextRow = payload.new as Record<string, unknown> | undefined;
          const oldRow = payload.old as Record<string, unknown> | undefined;
          const id = Number(nextRow?.id ?? oldRow?.id);
          if (!Number.isFinite(id) || id <= 0) return;

          if (event === "DELETE") {
            setProducts((prev) => {
              const list = prev.filter((p) => p.id !== id);
              const cacheKey = shopifyProductsKey(appliedQuery, page, pageSize);
              const current = peekCachedJson<ShopifyListPayload>(cacheKey);
              if (current) {
                setCachedJson(
                  cacheKey,
                  {
                    ...current,
                    products: list,
                    totalCount: Math.max(0, (current.totalCount ?? list.length) - 1),
                  },
                  60_000
                );
              }
              return list;
            });
            setTotalCount((n) => (n == null ? n : Math.max(0, n - 1)));
            if (selectedIdRef.current === id) {
              setSelectedId(null);
              setDetail(null);
            }
            return;
          }

          if (!nextRow) return;
          const mapped = mapCacheRowToListProduct(nextRow);
          const matchesSearch =
            !appliedQuery ||
            mapped.title.toLowerCase().includes(appliedQuery.toLowerCase());

          setProducts((prev) => {
            const existing = prev.find((p) => p.id === id);
            let list = prev;
            if (existing) {
              if (!matchesSearch) {
                list = prev.filter((p) => p.id !== id);
              } else {
                list = prev.map((p) => (p.id === id ? mapped : p));
              }
            } else if (matchesSearch && page === 1 && !appliedQuery) {
              list = [mapped, ...prev].slice(0, pageSize);
              setTotalCount((n) => (n == null ? n : n + 1));
            }
            const cacheKey = shopifyProductsKey(appliedQuery, page, pageSize);
            const current = peekCachedJson<ShopifyListPayload>(cacheKey);
            if (current) {
              setCachedJson(cacheKey, { ...current, products: list }, 60_000);
            }
            return list;
          });

        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storeId, appliedQuery, page, pageSize]);

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

  async function goToPage(target: number) {
    if (target < 1 || target === page || loading) return;
    if (totalPages != null && target > totalPages) return;
    await loadProducts({ q: appliedQuery || undefined, pageNum: target });
  }

  async function openProduct(id: number) {
    setSelectedId(id);
    setDetail(null);
    setPortalSku(null);
    setPreviewImage(null);
    setDetailLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/store/shopify-products/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load product");

      setDetail(data.product);
      setPreviewImage(data.product?.images?.[0]?.url ?? null);
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
    setPortalSku(null);
    setPreviewImage(null);
  }

  async function getProductSku() {
    if (!detail) return;
    setFetchingSku(true);
    setError(null);

    try {
      const res = await fetch(`/api/store/shopify-products/${detail.id}/sku`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: selectedVariantId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to get SKU");
      setPortalSku(data.sku as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get SKU");
    } finally {
      setFetchingSku(false);
    }
  }

  const showPager = hasNextPage || hasPreviousPage || page > 1;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-slate-900">
            Shopify products
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Synced from Shopify into your portal. Tab loads are from the
            database — new Shopify changes appear here automatically.
          </p>
        </div>

        <form
          onSubmit={submitSearch}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
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
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || syncingRemote}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {syncing || syncingRemote ? "Syncing…" : "⟳ Sync"}
          </button>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="whitespace-nowrap">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number];
                setPageSize(newSize);
                loadProducts({ pageNum: 1, limit: newSize });
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-800"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
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
                : !connected
                  ? "Connect Shopify in Integrations to sync your catalog."
                  : syncing || syncingRemote
                    ? "Syncing your Shopify catalog into the portal…"
                    : "No Shopify products in the portal yet. Click Sync."}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <ul className="divide-y divide-slate-100">
                {products.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => openProduct(product.id)}
                      className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/80 sm:flex-nowrap"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="truncate font-semibold text-slate-900">
                            {product.title}
                          </p>
                          {product.status && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                              {product.status}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-sm text-slate-600">
                          {product.priceFrom ? (
                            <span className="font-semibold text-slate-800">
                              From{" "}
                              {formatMoney(
                                parseFloat(product.priceFrom),
                                product.currency ?? currency
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-500">No price</span>
                          )}
                          {product.vendor ? ` · ${product.vendor}` : ""}
                          {product.productType
                            ? ` · ${product.productType}`
                            : ""}
                          {` · ${product.variantCount} variant${
                            product.variantCount === 1 ? "" : "s"
                          }`}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-emerald-700">
                        View →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {showPager && (
          <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Page {page}
              {totalPages != null ? ` of ${totalPages}` : ""}
              {` · ${pageSize} per page`}
              {totalCount != null ? ` · ${totalCount} total` : ""}
              {appliedQuery ? ` · filtered by “${appliedQuery}”` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={!hasPreviousPage || loading || page <= 1}
                onClick={() => goToPage(page - 1)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                Back
              </button>
              {totalPages != null &&
                pageWindow(page, totalPages).map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={loading}
                    onClick={() => goToPage(p)}
                    className={`min-w-9 rounded-lg px-2.5 py-1.5 text-sm font-semibold ${
                      p === page
                        ? "bg-emerald-500 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              {totalPages == null && (
                <span className="px-2 text-sm font-medium text-slate-600">
                  {page}
                </span>
              )}
              <button
                type="button"
                disabled={!hasNextPage || loading}
                onClick={() => goToPage(page + 1)}
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

                  {detail.images.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                        Product images
                      </p>
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewImage ?? detail.images[0].url}
                          alt={detail.images[0].alt ?? detail.title}
                          className="mx-auto max-h-80 w-full object-contain"
                        />
                      </div>
                      {detail.images.length > 1 && (
                        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                          {detail.images.map((img) => (
                            <button
                              key={img.url}
                              type="button"
                              onClick={() => setPreviewImage(img.url)}
                              className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${
                                (previewImage ?? detail.images[0].url) ===
                                img.url
                                  ? "border-emerald-500"
                                  : "border-slate-200"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={img.url}
                                alt={img.alt ?? ""}
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      No images for this product
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
                            <th className="px-3 py-2">Shopify SKU</th>
                            <th className="px-3 py-2">Price</th>
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
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-900">
                      Portal product SKU
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Generate a globally unique SKU for this Shopify product
                      (used across the portal catalog).
                    </p>

                    {detail.variants.length > 1 && (
                      <label className="mt-3 block text-xs font-medium text-slate-600">
                        Variant reference
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
                        onClick={getProductSku}
                        disabled={fetchingSku}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {fetchingSku
                          ? "Getting SKU..."
                          : portalSku
                            ? "Refresh SKU"
                            : "Get product SKU"}
                      </button>
                    </div>

                    {portalSku && (
                      <div className="mt-4">
                        <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                          Unique SKU
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="block max-w-full flex-1 overflow-x-auto rounded-lg bg-white px-3 py-2 text-sm font-semibold tracking-wide text-slate-900">
                            {portalSku}
                          </code>
                          <CopyButton text={portalSku} label="Copy SKU" />
                        </div>
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
