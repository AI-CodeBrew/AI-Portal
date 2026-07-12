"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminTopProduct } from "@/lib/admin/top-products";

export function AdminTopProductsPanel() {
  const [products, setProducts] = useState<AdminTopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/top-products");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setProducts(data.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Ranked by units sold across all reseller orders (pending + confirmed).
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && products.length === 0 ? (
        <p className="text-slate-600">Loading top products...</p>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <p className="font-medium text-slate-800">No product sales yet</p>
          <p className="mt-2 text-sm text-slate-600">
            When resellers sync or create orders with line items, top products
            will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                  Product
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-600">
                  Units sold
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-600">
                  Revenue
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-600">
                  Orders
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-600">
                  Resellers
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p, i) => (
                <tr key={`${p.title}-${i}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{p.title}</p>
                    {p.topReseller && (
                      <p className="text-xs text-slate-500">
                        e.g. {p.topReseller}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {p.unitsSold.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {p.currency
                      ? `${p.currency} ${p.revenue.toLocaleString()}`
                      : p.revenue.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {p.orderCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {p.resellerCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
