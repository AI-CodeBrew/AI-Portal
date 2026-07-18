"use client";

import { useCallback, useEffect, useState } from "react";

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

export function TemplateProductPicker({
  selectedKey,
  selectedVariantId,
  onSelect,
  onVariantChange,
}: {
  selectedKey: string;
  selectedVariantId: string;
  onSelect: (product: CatalogProduct) => void | Promise<void>;
  onVariantChange: (variantId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);

  const loadProducts = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "8" });
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/inbox/products?${params.toString()}`);
      const data = await res.json();
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProducts(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, loadProducts]);

  const selected = products.find((p) => p.key === selectedKey);

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-700">
        Product for template variables & image
      </p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search portal + Shopify..."
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
      />
      <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-1">
        {loading ? (
          <p className="px-2 py-2 text-xs text-slate-500">Searching...</p>
        ) : products.length === 0 ? (
          <p className="px-2 py-2 text-xs text-slate-500">No products found.</p>
        ) : (
          products.map((product) => (
            <button
              key={product.key}
              type="button"
              onClick={() => void onSelect(product)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-blue-50 ${
                selectedKey === product.key ? "bg-blue-100 ring-1 ring-blue-200" : ""
              }`}
            >
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.imageUrl}
                  alt=""
                  className="h-8 w-8 rounded object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-100 text-[9px] text-slate-500">
                  —
                </div>
              )}
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                {product.title}
              </span>
              <span className="shrink-0 text-[10px] uppercase text-slate-500">
                {product.source}
              </span>
            </button>
          ))
        )}
      </div>
      {selected && selected.variants.length > 1 && (
        <select
          value={selectedVariantId}
          onChange={(e) => onVariantChange(e.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">Select variant...</option>
          {selected.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export type { CatalogProduct };
