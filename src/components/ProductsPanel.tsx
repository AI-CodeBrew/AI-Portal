"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ProductBundleInput,
  ProductOptionInput,
  StoreProduct,
} from "@/lib/products/types";

const CURRENCIES = ["AED", "SAR", "USD", "EUR", "MAD", "EGP", "QAR", "KWD"];
const COUNTRIES = [
  "UAE",
  "Saudi Arabia",
  "Egypt",
  "Morocco",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Other",
];

type Tab = "basics" | "options" | "bundles" | "discount";

const TABS: { id: Tab; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "options", label: "Options & Variants" },
  { id: "bundles", label: "Bundles" },
  { id: "discount", label: "Discount" },
];

function emptyForm() {
  return {
    name: "",
    tagline: "",
    description: "",
    image_url: "",
    image_urls: [] as string[],
    price: "",
    currency: "AED",
    target_country: "UAE",
    sku: "",
    discount_enabled: false,
    discount_type: "percent" as "percent" | "fixed",
    discount_value: "",
    options: [] as ProductOptionInput[],
    bundles: [] as ProductBundleInput[],
  };
}

function suggestSku(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

function cartesianPreview(options: ProductOptionInput[]): string[] {
  const cleaned = options
    .map((o) => ({
      name: o.name.trim(),
      values: o.values.map((v) => v.trim()).filter(Boolean),
    }))
    .filter((o) => o.name && o.values.length > 0);
  if (cleaned.length === 0) return [];
  let combos: string[][] = [[]];
  for (const opt of cleaned) {
    const next: string[][] = [];
    for (const combo of combos) {
      for (const value of opt.values) next.push([...combo, value]);
    }
    combos = next;
  }
  return combos.map((c) => c.join(" / "));
}

export function ProductsPanel() {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StoreProduct | null>(null);
  const [tab, setTab] = useState<Tab>("basics");
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [skuTouched, setSkuTouched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/store/products");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load products");
      setProducts(data.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const variantPreview = useMemo(
    () => cartesianPreview(form.options),
    [form.options]
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setTab("basics");
    setSkuTouched(false);
    setCreatedLink(null);
    setModalOpen(true);
  }

  function openEdit(product: StoreProduct) {
    const gallery =
      product.image_urls?.length
        ? product.image_urls
        : product.image_url
          ? [product.image_url]
          : [];
    setEditing(product);
    setForm({
      name: product.name,
      tagline: product.tagline ?? "",
      description: product.description ?? "",
      image_url: product.image_url ?? gallery[0] ?? "",
      image_urls: gallery,
      price: String(product.price),
      currency: product.currency,
      target_country: product.target_country,
      sku: product.sku,
      discount_enabled: product.discount_enabled,
      discount_type: product.discount_type ?? "percent",
      discount_value:
        product.discount_value != null ? String(product.discount_value) : "",
      options: (product.options ?? []).map((o) => ({
        name: o.name,
        values: o.values,
      })),
      bundles: (product.bundles ?? []).map((b) => ({
        quantity: b.quantity,
        price: b.price,
        label: b.label,
      })),
    });
    setSkuTouched(true);
    setTab("basics");
    setCreatedLink(product.ad_link?.whatsapp_url ?? null);
    setModalOpen(true);
  }

  async function uploadImages(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of list) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/store/products/upload", {
          method: "POST",
          body,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        uploaded.push(data.url as string);
      }
      setForm((f) => {
        const image_urls = [...f.image_urls, ...uploaded];
        return {
          ...f,
          image_urls,
          image_url: f.image_url || image_urls[0] || "",
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeImage(url: string) {
    setForm((f) => {
      const image_urls = f.image_urls.filter((u) => u !== url);
      const image_url =
        f.image_url === url ? image_urls[0] ?? "" : f.image_url;
      return { ...f, image_urls, image_url };
    });
  }

  function setThumbnail(url: string) {
    setForm((f) => ({ ...f, image_url: url }));
  }

  async function saveProduct() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        tagline: form.tagline || null,
        description: form.description || null,
        image_url: form.image_url || form.image_urls[0] || null,
        image_urls: form.image_urls,
        price: Number(form.price) || 0,
        currency: form.currency,
        target_country: form.target_country,
        sku: form.sku || suggestSku(form.name),
        discount_enabled: form.discount_enabled,
        discount_type: form.discount_enabled ? form.discount_type : null,
        discount_value: form.discount_enabled
          ? Number(form.discount_value) || 0
          : null,
        options: form.options,
        bundles: form.bundles,
      };

      const res = await fetch(
        editing ? `/api/store/products/${editing.id}` : "/api/store/products",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");

      setCreatedLink(data.whatsapp_url ?? data.product?.ad_link?.whatsapp_url ?? null);
      await load();
      if (data.whatsapp_url) {
        // keep modal open briefly to show link
      } else {
        setModalOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeProduct(id: string) {
    if (!confirm("Delete this product?")) return;
    const res = await fetch(`/api/store/products/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Create products, upload images, and generate WhatsApp ad links. The
          SKU is used as <code className="text-xs">(ref: sku)</code> so the AI
          recognizes the product in chat.
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-400"
        >
          + Add product
        </button>
      </div>

      {error && !modalOpen && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
          Loading products...
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="font-medium text-slate-800">No products yet</p>
          <p className="mt-2 text-sm text-slate-600">
            Add your first product to generate an ad link for WhatsApp.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
          >
            Add product
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div
              key={p.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="aspect-[4/3] bg-slate-100">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    No image
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{p.name}</p>
                    {p.tagline && (
                      <p className="text-xs text-slate-500">{p.tagline}</p>
                    )}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                    {p.sku}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800">
                  {Number(p.price).toLocaleString()} {p.currency}
                </p>
                {p.ad_link?.whatsapp_url && (
                  <p className="mt-2 truncate text-xs text-emerald-700">
                    {p.ad_link.whatsapp_url}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  {p.ad_link?.whatsapp_url && (
                    <button
                      type="button"
                      onClick={() => copyLink(p.ad_link!.whatsapp_url!)}
                      className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      Copy ad link
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeProduct(p.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editing ? "Edit product" : "Add product"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold ${
                    tab === t.id
                      ? "border-emerald-500 text-emerald-700"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              )}

              {createdLink && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  <p className="font-semibold">Ad link ready</p>
                  <p className="mt-1 break-all text-xs">{createdLink}</p>
                  <button
                    type="button"
                    onClick={() => copyLink(createdLink)}
                    className="mt-2 text-xs font-semibold text-emerald-700 underline"
                  >
                    Copy link
                  </button>
                </div>
              )}

              {tab === "basics" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">Product name</span>
                    <input
                      value={form.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setForm((f) => ({
                          ...f,
                          name,
                          sku: skuTouched ? f.sku : suggestSku(name),
                        }));
                      }}
                      placeholder="Wireless Earbuds Pro"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">Short tagline</span>
                    <input
                      value={form.tagline}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, tagline: e.target.value }))
                      }
                      placeholder="ANC + 24h battery"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>

                  <div className="text-sm sm:col-span-2">
                    <span className="font-medium text-slate-700">
                      Product images
                    </span>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Upload multiple images. Click one to set it as the
                      thumbnail.
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {form.image_urls.map((url) => {
                        const isThumb = form.image_url === url;
                        return (
                          <div
                            key={url}
                            className={`group relative overflow-hidden rounded-xl border-2 ${
                              isThumb
                                ? "border-emerald-500 ring-2 ring-emerald-200"
                                : "border-slate-200"
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt=""
                              className="aspect-square w-full object-cover"
                            />
                            <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-black/55 p-1">
                              <button
                                type="button"
                                onClick={() => setThumbnail(url)}
                                className={`flex-1 rounded px-1 py-0.5 text-[10px] font-semibold ${
                                  isThumb
                                    ? "bg-emerald-500 text-white"
                                    : "bg-white/90 text-slate-800"
                                }`}
                              >
                                {isThumb ? "Thumbnail" : "Set thumb"}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeImage(url)}
                                className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-red-600"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-xs font-medium text-slate-600 hover:bg-slate-100">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.length) {
                              uploadImages(e.target.files);
                              e.target.value = "";
                            }
                          }}
                        />
                        {uploading ? "Uploading..." : "+ Add images"}
                      </label>
                    </div>
                  </div>

                  <label className="block text-sm sm:row-span-2">
                    <span className="font-medium text-slate-700">Full description</span>
                    <textarea
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, description: e.target.value }))
                      }
                      placeholder="What makes this product special?"
                      rows={6}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Price</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.price}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, price: e.target.value }))
                        }
                        placeholder="199"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Currency</span>
                      <select
                        value={form.currency}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, currency: e.target.value }))
                        }
                        className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="block text-sm sm:col-span-2">
                    <span className="font-medium text-slate-700">
                      SKU{" "}
                      <span className="font-normal text-slate-500">
                        (used in ad link as ref — AI finds the product by this)
                      </span>
                    </span>
                    <input
                      value={form.sku}
                      onChange={(e) => {
                        setSkuTouched(true);
                        setForm((f) => ({ ...f, sku: e.target.value }));
                      }}
                      placeholder="wireless-earbuds-pro"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                    />
                  </label>

                  <label className="block text-sm sm:col-span-2">
                    <span className="font-medium text-slate-700">Target country</span>
                    <select
                      value={form.target_country}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          target_country: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {tab === "options" && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Add options like Size or Color. Variants are auto-generated
                    from every combination.
                  </p>
                  {form.options.map((opt, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex gap-2">
                        <input
                          value={opt.name}
                          onChange={(e) => {
                            const options = [...form.options];
                            options[idx] = {
                              ...options[idx],
                              name: e.target.value,
                            };
                            setForm((f) => ({ ...f, options }));
                          }}
                          placeholder="Option name (e.g. Size)"
                          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              options: f.options.filter((_, i) => i !== idx),
                            }))
                          }
                          className="rounded-lg px-3 text-sm text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        value={opt.values.join(", ")}
                        onChange={(e) => {
                          const options = [...form.options];
                          options[idx] = {
                            ...options[idx],
                            values: e.target.value
                              .split(",")
                              .map((v) => v.trim())
                              .filter(Boolean),
                          };
                          setForm((f) => ({ ...f, options }));
                        }}
                        placeholder="Values separated by commas (e.g. S, M, L)"
                        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        options: [...f.options, { name: "", values: [] }],
                      }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  >
                    + Add option
                  </button>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Variants</p>
                    {variantPreview.length === 0 ? (
                      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                        Add at least one option with values to generate variants.
                      </div>
                    ) : (
                      <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                        {variantPreview.map((title) => (
                          <li
                            key={title}
                            className="px-4 py-2 text-sm text-slate-700"
                          >
                            {title}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {tab === "bundles" && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Bundles apply only to the base product, not to variants.
                    Buyers ordering N units get the largest bundle where bundle
                    qty ≤ N; remaining units are charged at the base price.
                  </p>
                  {form.bundles.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                      No bundles yet. Add a bundle to offer multi-pack pricing
                      (e.g. 3 for the price of 2.5).
                    </div>
                  ) : (
                    form.bundles.map((b, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 p-3"
                      >
                        <label className="text-xs">
                          Qty
                          <input
                            type="number"
                            min="2"
                            value={b.quantity}
                            onChange={(e) => {
                              const bundles = [...form.bundles];
                              bundles[idx] = {
                                ...bundles[idx],
                                quantity: Number(e.target.value) || 2,
                              };
                              setForm((f) => ({ ...f, bundles }));
                            }}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          />
                        </label>
                        <label className="text-xs">
                          Bundle price
                          <input
                            type="number"
                            min="0"
                            value={b.price}
                            onChange={(e) => {
                              const bundles = [...form.bundles];
                              bundles[idx] = {
                                ...bundles[idx],
                                price: Number(e.target.value) || 0,
                              };
                              setForm((f) => ({ ...f, bundles }));
                            }}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          />
                        </label>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                bundles: f.bundles.filter((_, i) => i !== idx),
                              }))
                            }
                            className="w-full rounded-lg py-1.5 text-sm text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        bundles: [
                          ...f.bundles,
                          { quantity: 2, price: Number(f.price) || 0 },
                        ],
                      }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  >
                    + Add bundle
                  </button>
                </div>
              )}

              {tab === "discount" && (
                <div className="space-y-4">
                  <label className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Apply a discount
                      </p>
                      <p className="text-xs text-slate-500">
                        Applied last — after any variant price override and
                        bundle tier.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={form.discount_enabled}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          discount_enabled: e.target.checked,
                        }))
                      }
                      className="h-5 w-5 rounded border-slate-300 text-emerald-600"
                    />
                  </label>
                  {form.discount_enabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-sm">
                        Type
                        <select
                          value={form.discount_type}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              discount_type: e.target.value as
                                | "percent"
                                | "fixed",
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        >
                          <option value="percent">Percent %</option>
                          <option value="fixed">Fixed amount</option>
                        </select>
                      </label>
                      <label className="text-sm">
                        Value
                        <input
                          type="number"
                          min="0"
                          value={form.discount_value}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              discount_value: e.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !form.name.trim()}
                onClick={saveProduct}
                className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save & generate link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
