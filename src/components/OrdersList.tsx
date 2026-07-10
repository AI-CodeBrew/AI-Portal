"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Order, OrderStatus } from "@/lib/types";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import { formatMoney } from "@/lib/currency";
import {
  getOrdersListCache,
  getCachedPage,
  setCachedPage,
  clearOrdersListCache,
  AUTO_REFRESH_MS,
  type StatusFilter,
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
  const existing = getOrdersListCache();
  const initialPage = existing?.lastPage ?? 1;
  const initialStatus: StatusFilter = existing?.lastStatus ?? "all";
  const initialCached = getCachedPage(initialStatus, initialPage);

  const [orders, setOrders] = useState<Order[]>(initialCached?.orders ?? []);
  const [loading, setLoading] = useState(!initialCached);
  const [syncing, setSyncing] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(
    initialCached?.totalPages ?? 1
  );
  const [shopifyTotal, setShopifyTotal] = useState(
    existing?.shopifyTotal ?? 0
  );
  const [filteredTotal, setFilteredTotal] = useState(
    initialCached?.filteredTotal ?? 0
  );
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>(initialStatus);
  const [statusCounts, setStatusCounts] = useState(
    existing?.statusCounts ?? {
      all: 0,
      pending: 0,
      confirmed: 0,
      cancelled: 0,
    }
  );
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);

  const nextPageInfoRef = useRef<string | null>(existing?.nextPageInfo ?? null);
  const syncedPagesRef = useRef(existing?.syncedPages ?? 0);
  const shopifyTotalRef = useRef(existing?.shopifyTotal ?? 0);
  const statusCountsRef = useRef(statusCounts);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  const { store, refresh: refreshStore } = useStoreStatus();
  const searchParams = useSearchParams();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyPage = useCallback(
    (
      nextOrders: Order[],
      p: number,
      status: StatusFilter,
      filtered: number,
      pages: number,
      shopify: number,
      counts: typeof statusCounts
    ) => {
      if (!mountedRef.current) return;
      setOrders(nextOrders);
      setFilteredTotal(filtered);
      setTotalPages(pages);
      setShopifyTotal(shopify);
      setStatusCounts(counts);
      shopifyTotalRef.current = shopify;
      statusCountsRef.current = counts;

      setCachedPage(
        status,
        p,
        {
          orders: nextOrders,
          filteredTotal: filtered,
          totalPages: pages,
        },
        {
          shopifyTotal: shopify,
          statusCounts: counts,
          nextPageInfo: nextPageInfoRef.current,
          syncedPages: syncedPagesRef.current,
          lastStatus: status,
          lastPage: p,
        }
      );
    },
    []
  );

  /** Background: refresh Shopify total count (does not block UI). */
  const refreshShopifyTotal = useCallback(async () => {
    if (!store?.shopify_connected) return;
    try {
      const countRes = await fetch("/api/orders/sync");
      if (!countRes.ok) return;
      const countData = await countRes.json();
      if (typeof countData.shopifyTotal === "number" && mountedRef.current) {
        shopifyTotalRef.current = countData.shopifyTotal;
        setShopifyTotal(countData.shopifyTotal);
        // Update total pages for "all" without refetching rows
        if (statusFilter === "all" && countData.shopifyTotal > 0) {
          setTotalPages(Math.ceil(countData.shopifyTotal / PAGE_SIZE));
        }
      }
    } catch {
      // ignore
    }
  }, [store?.shopify_connected, statusFilter]);

  /** Background: sync one Shopify page into DB if not yet synced. */
  const syncOneShopifyPage = useCallback(async () => {
    if (!store?.shopify_connected) return;
    if (syncedPagesRef.current >= 1 && nextPageInfoRef.current === null) {
      // Already fully synced at least once for page 1
      return;
    }
    // Only auto-sync the first page in background; deeper pages sync on Next
    if (syncedPagesRef.current >= 1) return;

    setSyncing(true);
    try {
      const res = await fetch("/api/orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: PAGE_SIZE }),
      });
      const data = await res.json();
      if (!res.ok) return;

      nextPageInfoRef.current = data.nextPageInfo ?? null;
      syncedPagesRef.current = 1;
      if (typeof data.shopifyTotal === "number") {
        shopifyTotalRef.current = data.shopifyTotal;
        if (mountedRef.current) {
          setShopifyTotal(data.shopifyTotal);
          if (statusFilter === "all") {
            setTotalPages(
              Math.ceil(data.shopifyTotal / PAGE_SIZE) || 1
            );
          }
        }
      }
    } catch {
      // ignore background sync errors
    } finally {
      if (mountedRef.current) setSyncing(false);
    }
  }, [store?.shopify_connected, statusFilter]);

  /** Sync the next Shopify cursor page when user goes deeper than synced. */
  const ensureSyncedThroughPage = useCallback(
    async (p: number): Promise<void> => {
      if (!store?.shopify_connected) return;
      if (syncedPagesRef.current >= p) return;

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
          if (typeof data.shopifyTotal === "number") {
            shopifyTotalRef.current = data.shopifyTotal;
            if (mountedRef.current) setShopifyTotal(data.shopifyTotal);
          }
          if (!data.nextPageInfo) break;
        }
      } finally {
        if (mountedRef.current) setSyncing(false);
      }
    },
    [store?.shopify_connected]
  );

  const loadPage = useCallback(
    async (
      p: number,
      status: StatusFilter,
      options?: {
        force?: boolean;
        showLoading?: boolean;
        /** Sync Shopify in background after DB load (default true for "all") */
        backgroundSync?: boolean;
      }
    ) => {
      const force = options?.force ?? false;
      const showLoading = options?.showLoading ?? true;
      const backgroundSync = options?.backgroundSync ?? status === "all";

      if (!force) {
        const hit = getCachedPage(status, p);
        if (hit) {
          applyPage(
            hit.orders,
            p,
            status,
            hit.filteredTotal,
            hit.totalPages,
            shopifyTotalRef.current,
            statusCountsRef.current
          );
          // Still refresh total in background
          void refreshShopifyTotal();
          return;
        }
      }

      if (loadingRef.current && !force) return;
      loadingRef.current = true;
      if (showLoading && mountedRef.current) setLoading(true);
      if (mountedRef.current) setError(null);

      try {
        // Fast path: load 25 rows from DB immediately — do NOT wait for Shopify
        const res = await fetch(
          `/api/orders?page=${p}&limit=${PAGE_SIZE}&status=${status}`
        );
        if (!res.ok) throw new Error("Failed to load orders");
        const data = await res.json();

        const nextOrders: Order[] = data.orders ?? [];
        const filtered = data.total ?? 0;
        const counts = data.statusCounts ?? statusCountsRef.current;
        const shopify = shopifyTotalRef.current;
        let pages = data.totalPages ?? 1;
        if (status === "all" && shopify > 0) {
          pages = Math.ceil(shopify / PAGE_SIZE);
        } else if (status === "all" && counts.all > 0) {
          pages = Math.ceil(counts.all / PAGE_SIZE);
        }

        applyPage(nextOrders, p, status, filtered, pages, shopify, counts);
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        loadingRef.current = false;
        if (mountedRef.current && showLoading) setLoading(false);
      }

      // Background: total count + optional first-page Shopify sync
      void refreshShopifyTotal();
      if (backgroundSync && p === 1) {
        void syncOneShopifyPage().then(() => {
          // Re-read page quietly after sync so new Shopify orders appear
          void loadPage(p, status, {
            force: true,
            showLoading: false,
            backgroundSync: false,
          });
        });
      }
    },
    [applyPage, refreshShopifyTotal, syncOneShopifyPage]
  );

  // Initial load / Shopify connect
  useEffect(() => {
    if (searchParams.get("connected") === "shopify") {
      setSuccessMsg("Shopify connected! Loading orders...");
      clearOrdersListCache();
      syncedPagesRef.current = 0;
      nextPageInfoRef.current = null;
      shopifyTotalRef.current = 0;
      refreshStore();
    }
  }, [searchParams, refreshStore]);

  useEffect(() => {
    if (!store) return;

    if (!store.shopify_connected) {
      setLoading(false);
      return;
    }

    const hit = getCachedPage(statusFilter, page);
    if (hit) {
      applyPage(
        hit.orders,
        page,
        statusFilter,
        hit.filteredTotal,
        hit.totalPages,
        shopifyTotalRef.current || (getOrdersListCache()?.shopifyTotal ?? 0),
        statusCountsRef.current
      );
      setLoading(false);
      return;
    }

    loadPage(page, statusFilter, { showLoading: true, backgroundSync: true });
    // Only re-run when store connection flips — page/filter changes use handlers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.shopify_connected]);

  // Soft background refresh of current page only (no Shopify re-sync)
  useEffect(() => {
    if (!store?.shopify_connected) return;
    const interval = setInterval(() => {
      loadPage(page, statusFilter, {
        force: true,
        showLoading: false,
        backgroundSync: false,
      });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [store?.shopify_connected, page, statusFilter, loadPage]);

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
      await loadPage(page, statusFilter, {
        force: true,
        showLoading: false,
        backgroundSync: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setConfirming(null);
    }
  }

  function handleTrackingSaved(tracking: {
    trackingNumber: string | null;
    trackingCompany: string | null;
  }) {
    if (!trackingOrder) return;
    const orderId = trackingOrder.id;
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
    await loadPage(page, statusFilter, {
      force: true,
      showLoading: true,
      backgroundSync: true,
    });
    setSuccessMsg("Orders updated.");
  }

  function changeFilter(next: StatusFilter) {
    if (next === statusFilter) return;
    setStatusFilter(next);
    setPage(1);
    setSuccessMsg(null);

    const hit = getCachedPage(next, 1);
    if (hit) {
      applyPage(
        hit.orders,
        1,
        next,
        hit.filteredTotal,
        hit.totalPages,
        shopifyTotalRef.current,
        statusCountsRef.current
      );
      setLoading(false);
      void refreshShopifyTotal();
      return;
    }

    loadPage(1, next, {
      showLoading: true,
      backgroundSync: next === "all",
    });
  }

  async function goToPage(p: number) {
    if (p === page || p < 1) return;
    setPage(p);
    setSuccessMsg(null);

    const hit = getCachedPage(statusFilter, p);
    if (hit) {
      applyPage(
        hit.orders,
        p,
        statusFilter,
        hit.filteredTotal,
        hit.totalPages,
        shopifyTotalRef.current,
        statusCountsRef.current
      );
      // If browsing deeper "all" pages, sync that Shopify page in background
      if (statusFilter === "all" && store?.shopify_connected) {
        void ensureSyncedThroughPage(p).then(() => {
          loadPage(p, statusFilter, {
            force: true,
            showLoading: false,
            backgroundSync: false,
          });
        });
      }
      return;
    }

    // Show DB page immediately; sync Shopify for this page in background if needed
    if (statusFilter === "all" && store?.shopify_connected) {
      void ensureSyncedThroughPage(p);
    }
    await loadPage(p, statusFilter, {
      showLoading: true,
      backgroundSync: false,
    });
  }

  if (!store?.shopify_connected) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <p className="font-medium text-slate-800">Connect Shopify to see orders</p>
        <p className="mt-2 text-sm text-slate-600">
          Orders sync from your Shopify store once connected.
        </p>
        <Link
          href="/dashboard/integrations/shopify"
          className="mt-4 inline-block text-sm font-semibold text-emerald-700 hover:underline"
        >
          Go to Integrations →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-600">
            Orders sync from your Shopify store. Confirm them here to update
            status and notify customers.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {shopifyTotal > 0 ? (
              <>
                <span className="font-semibold text-slate-700">
                  {shopifyTotal.toLocaleString()}
                </span>{" "}
                total on Shopify
                {orders.length > 0 && (
                  <>
                    {" · "}
                    showing {(page - 1) * PAGE_SIZE + 1}–
                    {(page - 1) * PAGE_SIZE + orders.length} of this page
                    (25 per page)
                  </>
                )}
              </>
            ) : (
              <>
                <span className="font-semibold text-slate-700">
                  {statusCounts.all.toLocaleString()}
                </span>{" "}
                in portal
              </>
            )}
            {statusFilter !== "all" && filteredTotal > 0
              ? ` · ${filteredTotal.toLocaleString()} ${statusFilter}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={syncing || loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <span className={syncing ? "animate-spin" : ""}>↻</span>
          {syncing ? "Updating..." : "Refresh"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => {
          const active = statusFilter === filter.value;
          const count =
            filter.value === "all"
              ? shopifyTotal || statusCounts.all
              : statusCounts[filter.value];
          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => changeFilter(filter.value)}
              className={`rounded-xl border px-3 py-2 text-left transition ${
                active ? filter.activeAccent : filter.accent
              }`}
            >
              <p className="text-sm font-semibold">
                {filter.label}
                <span className="ml-1.5 opacity-80">
                  {count.toLocaleString()}
                </span>
              </p>
              <p
                className={`text-[11px] ${active ? "opacity-80" : "text-slate-500"}`}
              >
                {filter.description}
              </p>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMsg}
        </div>
      )}

      {statusFilter === "pending" && statusCounts.pending > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {statusCounts.pending} order
          {statusCounts.pending === 1 ? "" : "s"} waiting for confirmation.
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
          Loading orders...
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="font-medium text-slate-800">
            No {statusFilter === "all" ? "" : statusFilter} orders
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {statusFilter === "pending"
              ? "New Shopify and WhatsApp orders will appear here."
              : "Try another filter or refresh."}
          </p>
          {statusFilter !== "all" && (
            <button
              type="button"
              onClick={() => changeFilter("all")}
              className="mt-4 text-sm font-semibold text-emerald-700 hover:underline"
            >
              View all orders
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Order
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Total
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">
                        {order.order_number ?? order.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-slate-500">{order.source}</p>
                    </td>
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
                      <StatusPill status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {order.status === "pending" && (
                          <button
                            type="button"
                            disabled={confirming === order.id}
                            onClick={() => confirmOrder(order.id)}
                            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
                          >
                            {confirming === order.id
                              ? "Confirming..."
                              : "Confirm"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setTrackingOrder(order)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Tracking
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {orders.map((order) => (
              <div
                key={order.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {order.order_number ?? order.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {order.customers?.name ?? "Customer"} ·{" "}
                      {formatShortDate(order.created_at)}
                    </p>
                  </div>
                  <StatusPill status={order.status} />
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800">
                  {formatMoney(Number(order.total ?? 0), order.currency)}
                </p>
                <div className="mt-3 flex gap-2">
                  {order.status === "pending" && (
                    <button
                      type="button"
                      disabled={confirming === order.id}
                      onClick={() => confirmOrder(order.id)}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setTrackingOrder(order)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    Tracking
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm text-slate-600">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || loading || syncing}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages || loading || syncing}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {trackingOrder && (
        <OrderTrackingModal
          order={trackingOrder}
          onClose={() => setTrackingOrder(null)}
          onSaved={handleTrackingSaved}
        />
      )}
    </div>
  );
}
