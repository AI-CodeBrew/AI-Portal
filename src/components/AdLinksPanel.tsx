"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import type {
  AdLinkProductSearchResult,
  AdWhatsAppLink,
} from "@/lib/ads/types";

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
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

export function AdLinksPanel() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [products, setProducts] = useState<AdLinkProductSearchResult[]>([]);
  const [selectedProduct, setSelectedProduct] =
    useState<AdLinkProductSearchResult | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
    null
  );
  const [generating, setGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<AdWhatsAppLink | null>(
    null
  );
  const [links, setLinks] = useState<AdWhatsAppLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [loadingLinks, setLoadingLinks] = useState(true);

  const loadLinks = useCallback(async () => {
    setLoadingLinks(true);
    try {
      const res = await fetch("/api/store/ad-links");
      const data = await res.json();
      if (res.ok) setLinks(data.links ?? []);
    } finally {
      setLoadingLinks(false);
    }
  }, []);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;

    setSearching(true);
    setError(null);
    setProducts([]);
    setSelectedProduct(null);
    setGeneratedLink(null);

    try {
      const res = await fetch(
        `/api/store/ad-links/search?q=${encodeURIComponent(query.trim())}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setProducts(data.products ?? []);
      if (data.currency) setCurrency(data.currency);
      if ((data.products ?? []).length === 0) {
        setError("No products found. Try a different name.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function selectProduct(product: AdLinkProductSearchResult) {
    setSelectedProduct(product);
    setSelectedVariantId(product.variants[0]?.id ?? null);
    setGeneratedLink(null);
  }

  async function generateLink() {
    if (!selectedProduct) return;

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/store/ad-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          variantId: selectedVariantId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate link");

      setGeneratedLink(data.link);
      await loadLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate link");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <span className="text-2xl" aria-hidden>
            📣
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Product ad links for Meta
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Search a Shopify product, generate a WhatsApp link, and use it in
              your Meta ad. When someone clicks and messages you, the AI already
              knows which product they came from.
            </p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product by name..."
            className="flex-1 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
          <button
            type="submit"
            disabled={searching || query.trim().length < 2}
            className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {searching ? "Searching..." : "Search Shopify"}
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {products.length > 0 && (
          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold text-slate-900">
              Results
            </p>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {products.map((product) => {
                const selected = selectedProduct?.id === product.id;
                const variant =
                  product.variants.find((v) => v.id === selectedVariantId) ??
                  product.variants[0];

                return (
                  <div
                    key={product.id}
                    className={`p-4 ${selected ? "bg-emerald-50/40" : ""}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {product.title}
                        </p>
                        {product.description && (
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                            {product.description}
                          </p>
                        )}
                        {variant && (
                          <p className="mt-2 text-sm font-medium text-slate-800">
                            From {formatMoney(parseFloat(variant.price), currency)}
                            {!variant.in_stock && (
                              <span className="ml-2 text-xs text-amber-700">
                                (low/out of stock)
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => selectProduct(product)}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                          selected
                            ? "bg-emerald-500 text-white"
                            : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {selected ? "Selected" : "Select"}
                      </button>
                    </div>

                    {selected && product.variants.length > 1 && (
                      <div className="mt-3">
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Variant for ad
                        </label>
                        <select
                          value={selectedVariantId ?? ""}
                          onChange={(e) =>
                            setSelectedVariantId(Number(e.target.value))
                          }
                          className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          {product.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.title} — {formatMoney(parseFloat(v.price), currency)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {selected && (
                      <button
                        type="button"
                        onClick={generateLink}
                        disabled={generating}
                        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {generating
                          ? "Generating..."
                          : "Generate WhatsApp ad link"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {generatedLink && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
            <p className="text-sm font-bold text-emerald-900">
              Link ready for Meta ads
            </p>
            <p className="mt-2 text-sm text-emerald-900/80">
              Use this as your ad destination URL, or paste the pre-filled message
              into a Click-to-WhatsApp ad in Meta Ads Manager.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-600">
                  WhatsApp URL
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="block max-w-full flex-1 overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs text-slate-800">
                    {generatedLink.whatsapp_url}
                  </code>
                  {generatedLink.whatsapp_url && (
                    <CopyButton
                      text={generatedLink.whatsapp_url}
                      label="Copy URL"
                    />
                  )}
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-600">
                  Pre-filled message
                </p>
                <div className="flex flex-wrap items-start gap-2">
                  <p className="flex-1 rounded-lg bg-white px-3 py-2 text-sm text-slate-800">
                    {generatedLink.prefill_message}
                  </p>
                  <CopyButton
                    text={generatedLink.prefill_message}
                    label="Copy message"
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Keep the{" "}
                  <code className="rounded bg-slate-100 px-1">(ref: …)</code> part
                  — it tells the AI which product the customer clicked on.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">Meta Ads setup</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>Create a campaign with Click to WhatsApp or Website traffic.</li>
                <li>Paste the WhatsApp URL as the destination link.</li>
                <li>
                  Or in Click-to-WhatsApp ads, use the same pre-filled message in
                  the message field.
                </li>
                <li>
                  When customers message you, the AI receives full product context
                  automatically.
                </li>
              </ol>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900">
          Generated ad links
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Recent links and how many customers opened a chat from them.
        </p>

        {loadingLinks ? (
          <p className="mt-4 text-sm text-slate-500">Loading...</p>
        ) : links.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No ad links yet. Search a product above to create one.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Clicks</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {links.map((link) => (
                  <tr key={link.id}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900">
                        {link.product_title}
                      </p>
                      {link.variant_title &&
                        link.variant_title !== "Default Title" && (
                          <p className="text-xs text-slate-500">
                            {link.variant_title}
                          </p>
                        )}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {link.click_count}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {new Date(link.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {link.whatsapp_url && (
                        <CopyButton text={link.whatsapp_url} label="Copy URL" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
