"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/currency";
import type { AdminResellerRow } from "@/lib/admin/resellers";
import type { AdminOrderRow } from "@/lib/admin/orders";

function resellerLabel(r: AdminResellerRow): string {
  return (
    r.full_name ||
    r.store?.store_name ||
    r.store?.shop_domain ||
    r.email
  );
}

function statusClass(status: string): string {
  if (status === "confirmed") return "bg-emerald-100 text-emerald-800";
  if (status === "cancelled") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-900";
}

export function AdminOrdersPanel({
  resellers,
  orders,
  initialStoreId,
}: {
  resellers: AdminResellerRow[];
  orders: AdminOrderRow[];
  initialStoreId?: string;
}) {
  const validInitial =
    initialStoreId &&
    resellers.some((r) => r.store_id === initialStoreId)
      ? initialStoreId
      : "all";

  const [selectedStoreId, setSelectedStoreId] = useState<string | "all">(
    validInitial
  );

  const filteredOrders = useMemo(() => {
    if (selectedStoreId === "all") return orders;
    return orders.filter((o) => o.store_id === selectedStoreId);
  }, [orders, selectedStoreId]);

  const selectedReseller =
    selectedStoreId === "all"
      ? null
      : resellers.find((r) => r.store_id === selectedStoreId);

  return (
    <div className="flex h-[calc(100vh-12rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Resellers
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedStoreId("all")}
          className={`block w-full border-b border-slate-200 px-4 py-3 text-left text-sm transition-colors hover:bg-white ${
            selectedStoreId === "all"
              ? "border-l-4 border-l-violet-600 bg-white font-semibold text-violet-700"
              : "border-l-4 border-l-transparent text-slate-700"
          }`}
        >
          All resellers
          <span className="mt-0.5 block text-xs font-normal text-slate-500">
            {orders.length} orders
          </span>
        </button>
        {resellers.map((r) => {
          const storeId = r.store_id;
          if (!storeId) return null;
          const count = orders.filter((o) => o.store_id === storeId).length;
          const active = selectedStoreId === storeId;

          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedStoreId(storeId)}
              className={`block w-full border-b border-slate-200 px-4 py-3 text-left text-sm transition-colors hover:bg-white ${
                active
                  ? "border-l-4 border-l-violet-600 bg-white font-semibold text-violet-700"
                  : "border-l-4 border-l-transparent text-slate-700"
              }`}
            >
              {resellerLabel(r)}
              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                {r.email}
              </span>
              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                {count} order{count === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="font-semibold text-slate-900">
            {selectedStoreId === "all"
              ? "All orders"
              : `Orders — ${selectedReseller ? resellerLabel(selectedReseller) : "Reseller"}`}
          </p>
          <p className="text-xs text-slate-600">
            View only — resellers confirm their own orders
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="sticky top-0 bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                  Order
                </th>
                {selectedStoreId === "all" && (
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-700">
                    Reseller
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={selectedStoreId === "all" ? 6 : 5}
                    className="px-4 py-12 text-center text-slate-600"
                  >
                    No orders for this reseller
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                      {order.order_number ?? order.id.slice(0, 8)}
                    </td>
                    {selectedStoreId === "all" && (
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {order.stores?.shop_domain ??
                          order.stores?.owner_email ??
                          "—"}
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
