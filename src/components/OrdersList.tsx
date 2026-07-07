"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Order, OrderStatus } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import { formatMoney } from "@/lib/currency";

const PAGE_SIZE = 25;

type StatusFilter = "all" | OrderStatus;

const STATUS_FILTERS: {
  value: StatusFilter;
  label: string;
  description: string;
  accent: string;
  activeAccent: string;
}[] = [
  {
    value: "all",
    label: "All",
    description: "Every order",
    accent: "border-slate-200 bg-white text-slate-700",
    activeAccent: "border-slate-900 bg-slate-900 text-white",
  },
  {
    value: "pending",
    label: "Pending",
    description: "Needs confirmation",
    accent: "border-amber-200 bg-amber-50 text-amber-900",
    activeAccent: "border-amber-600 bg-amber-600 text-white",
  },
  {
    value: "confirmed",
    label: "Confirmed",
    description: "Sent to Shopify",
    accent: "border-emerald-200 bg-emerald-50 text-emerald-900",
    activeAccent: "border-emerald-600 bg-emerald-600 text-white",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    description: "Not fulfilled",
    accent: "border-red-200 bg-red-50 text-red-900",
    activeAccent: "border-red-600 bg-red-600 text-white",
  },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusPill({ status }: { status: OrderStatus }) {
  const styles = {
    pending: "bg-amber-100 text-amber-900",
    confirmed: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function OrdersList() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [shopifyTotal, setShopifyTotal] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [statusCounts, setStatusCounts] = useState({
    all: 0,
    pending: 0,
    confirmed: 0,
    cancelled: 0,
  });

  const nextPageInfoRef = useRef<string | null>(null);
  const syncedPagesRef = useRef(0);

  const { store, refresh: refreshStore } = useStoreStatus();
  const searchParams = useSearchParams();

  const syncFromShopify = useCallback(
    async (targetPage: number) => {
      if (!store?.shopify_connected || statusFilter !== "all") return;

      setSyncing(true);
      try {
        while (syncedPagesRef.current < targetPage) {
          const res = await fetch("/api/orders/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pageInfo: nextPageInfoRef.current ?? undefined,
              limit: PAGE_SIZE,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Sync failed");

          nextPageInfoRef.current = data.nextPageInfo ?? null;
          syncedPagesRef.current += 1;
          setShopifyTotal(data.shopifyTotal ?? 0);

          if (!data.nextPageInfo && data.synced === 0) break;
          if (!data.nextPageInfo && syncedPagesRef.current < targetPage) break;
        }
      } finally {
        setSyncing(false);
      }
    },
    [store?.shopify_connected, statusFilter]
  );

  const fetchOrdersPage = useCallback(
    async (p: number, status: StatusFilter) => {
      const res = await fetch(
        `/api/orders?page=${p}&limit=${PAGE_SIZE}&status=${status}`
      );
      if (!res.ok) throw new Error("Failed to load orders");
      const data = await res.json();
      setOrders(data.orders ?? []);
      setFilteredTotal(data.total ?? 0);
      setStatusCounts(
        data.statusCounts ?? {
          all: 0,
          pending: 0,
          confirmed: 0,
          cancelled: 0,
        }
      );

      if (status === "all" && shopifyTotal > 0) {
        setTotalPages(Math.ceil(shopifyTotal / PAGE_SIZE));
      } else {
        setTotalPages(data.totalPages ?? 1);
      }
    },
    [shopifyTotal]
  );

  const loadPage = useCallback(
    async (p: number, status: StatusFilter = statusFilter) => {
      setLoading(true);
      setError(null);
      try {
        await syncFromShopify(p);
        await fetchOrdersPage(p, status);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [syncFromShopify, fetchOrdersPage, statusFilter]
  );

  useEffect(() => {
    if (searchParams.get("connected") === "shopify") {
      setSuccessMsg("Shopify connected! Syncing your orders...");
      refreshStore();
    }
  }, [searchParams, refreshStore]);

  useEffect(() => {
    if (store?.shopify_connected) {
      loadPage(page, statusFilter);
    } else {
      setLoading(false);
    }
  }, [store?.shopify_connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => fetchOrdersPage(page, statusFilter)
      )
      .subscribe();

    const poll = setInterval(() => {
      if (store?.shopify_connected) {
        syncFromShopify(1).then(() => fetchOrdersPage(page, statusFilter));
      }
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [
    page,
    statusFilter,
    store?.shopify_connected,
    fetchOrdersPage,
    syncFromShopify,
  ]);

  useEffect(() => {
    if (statusFilter === "all" && shopifyTotal > 0) {
      setTotalPages(Math.ceil(shopifyTotal / PAGE_SIZE));
    }
  }, [shopifyTotal, statusFilter]);

  async function confirmOrder(id: string) {
    setConfirming(id);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/orders/${id}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Confirm failed");

      let successText = "Order confirmed.";
      if (data.shopify_sync_status === "synced") {
        successText += " Synced to Shopify.";
      } else if (data.shopify_sync_status === "failed") {
        successText += " Shopify sync had an issue.";
      }
      if (data.whatsapp_sent) {
        successText += " Customer notified on WhatsApp.";
      } else if (data.whatsapp_error) {
        successText += ` WhatsApp not sent: ${data.whatsapp_error}`;
      }
      setSuccessMsg(successText);
      await loadPage(page, statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setConfirming(null);
    }
  }

  async function handleRefresh() {
    nextPageInfoRef.current = null;
    syncedPagesRef.current = 0;
    await loadPage(page, statusFilter);
    setSuccessMsg("Orders refreshed from Shopify.");
  }

  function changeFilter(next: StatusFilter) {
    setStatusFilter(next);
    setPage(1);
    loadPage(1, next);
  }

  function goToPage(p: number) {
    setPage(p);
    loadPage(p, statusFilter);
  }

  if (!store?.shopify_connected && !loading) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <p className="text-lg font-semibold text-slate-800">
          Connect Shopify to manage orders
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Orders sync from your Shopify store. Confirm them here to update
          Shopify and notify customers on WhatsApp.
        </p>
        <Link
          href="/dashboard/integrations/shopify"
          className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Connect Shopify
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600">
            {shopifyTotal > 0
              ? `${shopifyTotal.toLocaleString()} orders on Shopify`
              : `${statusCounts.all.toLocaleString()} orders synced`}
            {statusFilter !== "all" && filteredTotal > 0
              ? ` · showing ${filteredTotal.toLocaleString()} ${statusFilter}`
              : ""}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={syncing || loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <span className={syncing ? "animate-spin" : ""}>↻</span>
          {syncing ? "Syncing..." : "Refresh"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STATUS_FILTERS.map((filter) => {
          const count =
            statusCounts[filter.value as keyof typeof statusCounts] ?? 0;
          const active = statusFilter === filter.value;
          return (
            <button
              key={filter.value}
              onClick={() => changeFilter(filter.value)}
              className={`rounded-xl border p-4 text-left transition-all ${
                active ? filter.activeAccent : filter.accent
              } ${!active ? "hover:shadow-sm" : "shadow-md"}`}
            >
              <p className="text-2xl font-bold tabular-nums">{count}</p>
              <p className="mt-1 text-sm font-semibold">{filter.label}</p>
              <p
                className={`mt-0.5 text-xs ${active ? "text-white/80" : "opacity-70"}`}
              >
                {filter.description}
              </p>
            </button>
          );
        })}
      </div>

      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
          {error.includes("403") || error.includes("read_orders") ? (
            <p className="mt-1 text-xs font-normal">
              Reconnect Shopify in Integrations with read_orders and write_orders
              scopes.
            </p>
          ) : null}
        </div>
      )}

      {statusFilter === "pending" && statusCounts.pending > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{statusCounts.pending} pending</strong> — review and confirm
          each order. Confirmation updates Shopify and sends WhatsApp if
          connected.
        </div>
      )}

      {loading && orders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-slate-600">
            {syncing ? "Syncing orders from Shopify..." : "Loading orders..."}
          </p>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="font-medium text-slate-800">
            No {statusFilter === "all" ? "" : statusFilter} orders
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {statusFilter === "pending"
              ? "You're all caught up — no orders waiting for confirmation."
              : "Try another filter or refresh from Shopify."}
          </p>
          {statusFilter !== "all" && (
            <button
              onClick={() => changeFilter("all")}
              className="mt-4 text-sm font-semibold text-blue-600 hover:underline"
            >
              View all orders
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Order
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Items
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Total
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Shopify sync
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => {
                  const customer = order.customers as
                    | { phone: string; name: string | null }
                    | null
                    | undefined;
                  const items = (order.items ?? []) as Array<{
                    title: string;
                    quantity: number;
                  }>;
                  const itemSummary =
                    items.length > 0
                      ? `${items.reduce((n, i) => n + i.quantity, 0)} items`
                      : "—";

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">
                          {order.order_number ?? order.id.slice(0, 8)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatShortDate(order.created_at)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-slate-800">
                          {customer?.name ?? "—"}
                        </p>
                        {customer?.phone && (
                          <p className="text-xs text-slate-500">
                            {customer.phone}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {itemSummary}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-slate-900">
                        {formatMoney(order.total, order.currency)}
                      </td>
                      <td className="px-4 py-4">
                        <StatusPill status={order.status} />
                      </td>
                      <td className="px-4 py-4">
                        {order.status === "confirmed" ? (
                          <span
                            className={`text-xs font-semibold ${
                              order.shopify_sync_status === "synced"
                                ? "text-emerald-700"
                                : order.shopify_sync_status === "failed"
                                  ? "text-red-700"
                                  : "text-slate-500"
                            }`}
                            title={order.shopify_sync_error ?? undefined}
                          >
                            {order.shopify_sync_status === "synced"
                              ? "Synced"
                              : order.shopify_sync_status === "failed"
                                ? "Failed"
                                : "—"}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {order.status === "pending" ? (
                          <button
                            onClick={() => confirmOrder(order.id)}
                            disabled={confirming === order.id}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {confirming === order.id
                              ? "Confirming..."
                              : "Confirm"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">
                            {order.confirmed_at
                              ? formatDate(order.confirmed_at)
                              : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {orders.map((order) => {
              const customer = order.customers as
                | { phone: string; name: string | null }
                | null
                | undefined;
              const items = (order.items ?? []) as Array<{
                title: string;
                quantity: number;
              }>;

              return (
                <div key={order.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {order.order_number ?? order.id.slice(0, 8)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDate(order.created_at)}
                      </p>
                    </div>
                    <StatusPill status={order.status} />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Customer</p>
                      <p className="font-medium text-slate-800">
                        {customer?.name ?? customer?.phone ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Total</p>
                      <p className="font-semibold text-slate-900">
                        {formatMoney(order.total, order.currency)}
                      </p>
                    </div>
                  </div>

                  {items.length > 0 && (
                    <p className="mt-2 text-xs text-slate-600 line-clamp-2">
                      {items
                        .map((i) => `${i.quantity}× ${i.title}`)
                        .join(", ")}
                    </p>
                  )}

                  {order.status === "pending" ? (
                    <button
                      onClick={() => confirmOrder(order.id)}
                      disabled={confirming === order.id}
                      className="mt-4 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {confirming === order.id ? "Confirming..." : "Confirm order"}
                    </button>
                  ) : order.confirmed_at ? (
                    <p className="mt-3 text-xs text-slate-500">
                      Confirmed {formatDate(order.confirmed_at)}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm text-slate-600">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || loading || syncing}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages || loading || syncing}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
