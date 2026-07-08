"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Order, OrderStatus } from "@/lib/types";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import { formatMoney } from "@/lib/currency";
import {
  getOrdersListCache,
  setOrdersListCache,
  isOrdersCacheFresh,
  clearOrdersListCache,
  AUTO_REFRESH_MS,
  type StatusFilter,
  type OrdersListCache,
} from "@/lib/orders-list-cache";
import { OrderTrackingModal } from "@/components/OrderTrackingModal";

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

const PAGE_SIZE = 25;

function hydrateFromCache(): {
  orders: Order[];
  page: number;
  totalPages: number;
  shopifyTotal: number;
  filteredTotal: number;
  statusFilter: StatusFilter;
  statusCounts: OrdersListCache["statusCounts"];
  nextPageInfo: string | null;
  syncedPages: number;
} | null {
  const cached = getOrdersListCache();
  if (!cached) return null;
  return {
    orders: cached.orders,
    page: cached.page,
    totalPages: cached.totalPages,
    shopifyTotal: cached.shopifyTotal,
    filteredTotal: cached.filteredTotal,
    statusFilter: cached.statusFilter,
    statusCounts: cached.statusCounts,
    nextPageInfo: cached.nextPageInfo,
    syncedPages: cached.syncedPages,
  };
}

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
  const cached = hydrateFromCache();
  const cacheIsFresh = Boolean(cached && isOrdersCacheFresh());
  const [orders, setOrders] = useState<Order[]>(cached?.orders ?? []);
  const [loading, setLoading] = useState(!cacheIsFresh);
  const [syncing, setSyncing] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [page, setPage] = useState(cached?.page ?? 1);
  const [totalPages, setTotalPages] = useState(cached?.totalPages ?? 1);
  const [shopifyTotal, setShopifyTotal] = useState(cached?.shopifyTotal ?? 0);
  const [filteredTotal, setFilteredTotal] = useState(cached?.filteredTotal ?? 0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    cached?.statusFilter ?? "pending"
  );
  const [statusCounts, setStatusCounts] = useState(
    cached?.statusCounts ?? {
      all: 0,
      pending: 0,
      confirmed: 0,
      cancelled: 0,
    }
  );

  const nextPageInfoRef = useRef<string | null>(cached?.nextPageInfo ?? null);
  const syncedPagesRef = useRef(cached?.syncedPages ?? 0);
  const initialLoadDoneRef = useRef(cacheIsFresh);
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);

  const { store, refresh: refreshStore } = useStoreStatus();
  const searchParams = useSearchParams();

  const applyOrdersData = useCallback(
    (
      data: {
        orders?: Order[];
        total?: number;
        totalPages?: number;
        statusCounts?: typeof statusCounts;
      },
      p: number,
      status: StatusFilter,
      shopifyTotalValue: number
    ) => {
      const nextOrders = data.orders ?? [];
      const nextFilteredTotal = data.total ?? 0;
      const nextStatusCounts = data.statusCounts ?? statusCounts;
      let nextTotalPages = data.totalPages ?? 1;
      if (status === "all" && shopifyTotalValue > 0) {
        nextTotalPages = Math.ceil(shopifyTotalValue / PAGE_SIZE);
      }

      setOrders(nextOrders);
      setFilteredTotal(nextFilteredTotal);
      setStatusCounts(nextStatusCounts);
      setTotalPages(nextTotalPages);

      setOrdersListCache({
        orders: nextOrders,
        page: p,
        totalPages: nextTotalPages,
        shopifyTotal: shopifyTotalValue,
        filteredTotal: nextFilteredTotal,
        statusFilter: status,
        statusCounts: nextStatusCounts,
        nextPageInfo: nextPageInfoRef.current,
        syncedPages: syncedPagesRef.current,
        fetchedAt: Date.now(),
      });
    },
    [statusCounts]
  );

  const fetchOrdersPage = useCallback(
    async (p: number, status: StatusFilter, shopifyTotalValue = shopifyTotal) => {
      const res = await fetch(
        `/api/orders?page=${p}&limit=${PAGE_SIZE}&status=${status}`
      );
      if (!res.ok) throw new Error("Failed to load orders");
      const data = await res.json();
      applyOrdersData(data, p, status, shopifyTotalValue);
    },
    [shopifyTotal, applyOrdersData]
  );

  const loadPage = useCallback(
    async (
      p: number,
      status: StatusFilter = statusFilter,
      options?: { syncShopify?: boolean; showLoading?: boolean }
    ) => {
      const syncShopify = options?.syncShopify ?? true;
      const showLoading = options?.showLoading ?? true;

      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      try {
        let currentShopifyTotal = shopifyTotal;
        if (syncShopify) {
          if (!store?.shopify_connected || status !== "all") {
            // skip shopify sync
          } else {
            setSyncing(true);
            try {
              while (syncedPagesRef.current < p) {
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
                currentShopifyTotal = data.shopifyTotal ?? currentShopifyTotal;
                setShopifyTotal(currentShopifyTotal);

                if (!data.nextPageInfo && data.synced === 0) break;
                if (!data.nextPageInfo && syncedPagesRef.current < p) break;
              }
            } finally {
              setSyncing(false);
            }
          }
        }
        await fetchOrdersPage(p, status, currentShopifyTotal);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [fetchOrdersPage, statusFilter, store?.shopify_connected, shopifyTotal]
  );

  useEffect(() => {
    if (searchParams.get("connected") === "shopify") {
      setSuccessMsg("Shopify connected! Syncing your orders...");
      clearOrdersListCache();
      initialLoadDoneRef.current = false;
      refreshStore();
    }
  }, [searchParams, refreshStore]);

  useEffect(() => {
    if (!store?.shopify_connected) {
      setLoading(false);
      return;
    }

    if (initialLoadDoneRef.current && isOrdersCacheFresh()) {
      setLoading(false);
      return;
    }

    initialLoadDoneRef.current = true;
    loadPage(page, statusFilter);
  }, [store?.shopify_connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!store?.shopify_connected) return;

    const interval = setInterval(() => {
      loadPage(page, statusFilter, {
        syncShopify: statusFilter === "all",
        showLoading: false,
      });
    }, AUTO_REFRESH_MS);

    return () => clearInterval(interval);
  }, [store?.shopify_connected, page, statusFilter, loadPage]);

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

  function handleTrackingSaved(
    orderId: string,
    tracking: {
      trackingNumber: string | null;
      trackingCompany: string | null;
    }
  ) {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              tracking_number: tracking.trackingNumber,
              tracking_company: tracking.trackingCompany,
            }
          : o
      )
    );
    setSuccessMsg(
      tracking.trackingNumber
        ? "Tracking saved and synced to Shopify."
        : "Tracking saved."
    );
  }

  async function handleRefresh() {
    nextPageInfoRef.current = null;
    syncedPagesRef.current = 0;
    await loadPage(page, statusFilter, {
      syncShopify: statusFilter === "all",
      showLoading: true,
    });
    setSuccessMsg("Orders refreshed.");
  }

  function changeFilter(next: StatusFilter) {
    setStatusFilter(next);
    setPage(1);
    nextPageInfoRef.current = null;
    syncedPagesRef.current = 0;
    loadPage(1, next, { syncShopify: next === "all", showLoading: true });
  }

  function goToPage(p: number) {
    setPage(p);
    loadPage(p, statusFilter, {
      syncShopify: statusFilter === "all",
      showLoading: true,
    });
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
          {!loading && isOrdersCacheFresh() && (
            <p className="mt-1 text-xs text-slate-500">
              Showing cached data · use Refresh or wait for auto-refresh (10
              min)
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={syncing || loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          title="Fetch latest orders from Shopify and database"
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
                    Tracking
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
                    <tr
                      key={order.id}
                      className="cursor-pointer hover:bg-slate-50/80"
                      onClick={() => setTrackingOrder(order)}
                    >
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
                        {order.tracking_number ? (
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {order.tracking_number}
                            </p>
                            {order.tracking_company && (
                              <p className="text-xs text-slate-500">
                                {order.tracking_company}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Add tracking
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
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
                <div
                  key={order.id}
                  className="cursor-pointer p-4 hover:bg-slate-50/80"
                  onClick={() => setTrackingOrder(order)}
                >
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

                  {order.tracking_number && (
                    <p className="mt-2 text-xs font-medium text-slate-700">
                      Tracking: {order.tracking_number}
                      {order.tracking_company
                        ? ` (${order.tracking_company})`
                        : ""}
                    </p>
                  )}

                  <div
                    className="mt-4 flex flex-wrap gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                  {order.status === "pending" ? (
                    <button
                      onClick={() => confirmOrder(order.id)}
                      disabled={confirming === order.id}
                      className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {confirming === order.id ? "Confirming..." : "Confirm order"}
                    </button>
                  ) : order.confirmed_at ? (
                    <p className="text-xs text-slate-500">
                      Confirmed {formatDate(order.confirmed_at)}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setTrackingOrder(order)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Tracking
                  </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {trackingOrder && (
        <OrderTrackingModal
          order={trackingOrder}
          onClose={() => setTrackingOrder(null)}
          onSaved={(tracking) =>
            handleTrackingSaved(trackingOrder.id, tracking)
          }
        />
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
