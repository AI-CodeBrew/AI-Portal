"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatMoney } from "@/lib/currency";
import type { AdminResellerRow } from "@/lib/admin/resellers";
import type { AdminOrderRow } from "@/lib/admin/orders";
import { ADMIN_ORDERS_PAGE_SIZE } from "@/lib/admin/orders";

function resellerLabel(r: AdminResellerRow): string {
  return (
    r.full_name ||
    r.store?.store_name ||
    r.store?.shop_domain ||
    r.email
  );
}

function resellerOptionLabel(r: AdminResellerRow): string {
  const name = resellerLabel(r);
  const store = r.store?.store_name;
  if (store && store !== name) return `${name} — ${store}`;
  if (r.store?.shop_domain) return `${name} (${r.store.shop_domain})`;
  return name;
}

function statusClass(status: string): string {
  if (status === "confirmed") return "bg-emerald-100 text-emerald-800";
  if (status === "cancelled") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-900";
}

export function AdminOrdersPanel({
  resellers,
  initialStoreId,
}: {
  resellers: AdminResellerRow[];
  initialStoreId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const resellersWithStore = useMemo(
    () => resellers.filter((r) => r.store_id),
    [resellers]
  );

  const validInitial =
    initialStoreId &&
    resellersWithStore.some((r) => r.store_id === initialStoreId)
      ? initialStoreId
      : "all";

  const [selectedStoreId, setSelectedStoreId] = useState<string | "all">(
    validInitial
  );
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  const selectedReseller =
    selectedStoreId === "all"
      ? null
      : resellersWithStore.find((r) => r.store_id === selectedStoreId);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(ADMIN_ORDERS_PAGE_SIZE),
    });
    if (selectedStoreId !== "all") {
      params.set("storeId", selectedStoreId);
    }

    try {
      const res = await fetch(`/api/admin/orders?${params}`);
      const data = await res.json();
      if (res.ok) {
        setOrders(data.orders ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, selectedStoreId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  function handleStoreChange(next: string) {
    setSelectedStoreId(next);
    setPage(1);

    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("store");
    else params.set("store", next);
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `/admin/orders?${qs}` : "/admin/orders", {
      scroll: false,
    });
  }

  function goToPage(next: number) {
    if (next < 1 || next > totalPages) return;
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * ADMIN_ORDERS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * ADMIN_ORDERS_PAGE_SIZE, total);
  const colSpan = selectedStoreId === "all" ? 7 : 6;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-4 sm:py-4">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {selectedStoreId === "all"
              ? "All orders"
              : `Orders — ${selectedReseller ? resellerLabel(selectedReseller) : "Reseller"}`}
          </p>
          <p className="text-xs text-slate-600">
            {ADMIN_ORDERS_PAGE_SIZE} orders per page
          </p>
        </div>

        <div className="flex w-full flex-col gap-1 sm:min-w-[280px] sm:w-auto">
          <label
            htmlFor="reseller-filter"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Filter by reseller
          </label>
          <select
            id="reseller-filter"
            value={selectedStoreId}
            onChange={(e) => handleStoreChange(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
          >
            <option value="all">All resellers</option>
            {resellersWithStore.map((r) => (
              <option key={r.id} value={r.store_id!}>
                {resellerOptionLabel(r)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Order
              </th>
              {selectedStoreId === "all" && (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                  Reseller / Store
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Customer
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Total
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Source
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-4 py-12 text-center text-slate-600"
                >
                  Loading orders...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-4 py-12 text-center text-slate-600"
                >
                  No orders found
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                    {order.order_number ?? order.id.slice(0, 8)}
                  </td>
                  {selectedStoreId === "all" && (
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <p>
                        {order.stores?.store_name ??
                          order.stores?.shop_domain ??
                          "—"}
                      </p>
                      {order.stores?.shop_domain &&
                        order.stores?.store_name && (
                          <p className="text-xs text-slate-500">
                            {order.stores.shop_domain}
                          </p>
                        )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <p>{order.customers?.name ?? "—"}</p>
                    {order.customers?.phone && (
                      <p className="text-xs text-slate-500">
                        {order.customers.phone}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    {formatMoney(Number(order.total ?? 0), order.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(order.status)}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {order.source}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 0 && (
      <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <p className="text-sm text-slate-600">
            Showing {rangeStart}–{rangeEnd} of {total.toLocaleString()} order
            {total === 1 ? "" : "s"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || loading}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-100"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages || loading}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-100"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
