"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/currency";

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
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [products, setProducts] = useState<ListProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [previousCursor, setPreviousCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(
    10
  );
  const [totalCount, setTotalCount] = useState<number | null>(null);
  /** Cursors to reach each page number (page 1 has no cursor). */
  const pageCursorsRef = useRef<Map<number, string | null>>(new Map([[1, null]]));

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

  const loadProducts = useCallback(
    async (opts: {
      q?: string;
      cursor?: string | null;
      direction?: "next" | "prev";
      pageNum?: number;
      limit?: number;
      resetCursors?: boolean;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const limit = opts.limit ?? pageSize;
        const params = new URLSearchParams();
        if (opts.q) params.set("q", opts.q);
        if (opts.cursor) params.set("cursor", opts.cursor);
        if (opts.direction) params.set("direction", opts.direction);
        params.set("limit", String(limit));

        const res = await fetch(`/api/store/shopify-products?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load products");

        setProducts(data.products ?? []);
        setCurrency(data.currency ?? "USD");
        setHasNextPage(Boolean(data.hasNextPage));
        setHasPreviousPage(Boolean(data.hasPreviousPage));
        setNextCursor(data.nextCursor ?? null);
        setPreviousCursor(data.previousCursor ?? null);
        setTotalCount(
          typeof data.totalCount === "number" ? data.totalCount : null
        );

        const pageNum = opts.pageNum ?? 1;
        if (opts.resetCursors) {
          pageCursorsRef.current = new Map([[1, null]]);
        }
        if (opts.pageNum != null) setPage(opts.pageNum);

        if (data.nextCursor) {
          pageCursorsRef.current.set(pageNum + 1, data.nextCursor);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load products");
        setProducts([]);
      } finally {
        setLoading(false);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    pageCursorsRef.current = new Map([[1, null]]);
    loadProducts({ pageNum: 1, limit: pageSize, resetCursors: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when page size changes
  }, [pageSize]);

  function onSearchChange(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const q = value.trim();
      setAppliedQuery(q);
      pageCursorsRef.current = new Map([[1, null]]);
      loadProducts({
        q: q || undefined,
        pageNum: 1,
        resetCursors: true,
      });
    }, 400);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    setAppliedQuery(q);
    pageCursorsRef.current = new Map([[1, null]]);
    loadProducts({
      q: q || undefined,
      pageNum: 1,
      resetCursors: true,
    });
  }

  async function goToPage(target: number) {
    if (target < 1 || target === page || loading) return;
    if (totalPages != null && target > totalPages) return;

    if (target === page + 1 && nextCursor) {
      await loadProducts({
        q: appliedQuery || undefined,
        cursor: nextCursor,
        direction: "next",
        pageNum: target,
      });
      return;
    }

    if (target === page - 1 && previousCursor) {
      await loadProducts({
        q: appliedQuery || undefined,
        cursor: previousCursor,
        direction: "prev",
        pageNum: target,
      });
      return;
    }

    const known = pageCursorsRef.current.get(target);
    if (target === 1 || known !== undefined) {
      await loadProducts({
        q: appliedQuery || undefined,
        cursor: known ?? null,
        direction: "next",
        pageNum: target,
      });
      return;
    }

    // Walk forward from the highest known page cursor at or below target
    let fromPage = 1;
    let startCursor: string | null = null;
    for (const [p, c] of pageCursorsRef.current) {
      if (p <= target && p >= fromPage) {
        fromPage = p;
        startCursor = c;
      }
    }

    setLoading(true);
    try {
      let cursor = startCursor;
      for (let p = fromPage; p <= target; p++) {
        const params = new URLSearchParams();
        if (appliedQuery) params.set("q", appliedQuery);
        if (cursor) params.set("cursor", cursor);
        params.set("direction", "next");
        params.set("limit", String(pageSize));
        const res = await fetch(`/api/store/shopify-products?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load products");

        pageCursorsRef.current.set(p, cursor);
        if (data.nextCursor) {
          pageCursorsRef.current.set(p + 1, data.nextCursor);
        }

        if (p === target) {
          setProducts(data.products ?? []);
          setCurrency(data.currency ?? "USD");
          setHasNextPage(Boolean(data.hasNextPage));
          setHasPreviousPage(Boolean(data.hasPreviousPage) || p > 1);
          setNextCursor(data.nextCursor ?? null);
          setPreviousCursor(data.previousCursor ?? null);
          setTotalCount(
            typeof data.totalCount === "number" ? data.totalCount : null
          );
          setPage(target);
          return;
        }

        if (!data.hasNextPage || !data.nextCursor) {
          setError("That page is not available.");
          return;
        }
        cursor = data.nextCursor;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
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
            Browse your catalog and generate a unique portal SKU for each
            product.
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
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="whitespace-nowrap">Rows</span>
            <select
              value={pageSize}
              onChange={(e) =>
                setPageSize(
                  Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]
                )
              }
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
                : "No active Shopify products found."}
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
