"use client";

// Reseller orders list with Back/Next + editable rows-per-page.
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Order, OrderShippingAddress, OrderStatus } from "@/lib/types";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import { formatMoney } from "@/lib/currency";
import {
  getOrdersListCache,
  getCachedPage,
  setCachedPage,
  clearOrdersListCache,
  AUTO_REFRESH_MS,
  ORDERS_PAGE_SIZE,
  dateRangeFromPreset,
  type StatusFilter,
  type SourceFilter,
  type DatePreset,
} from "@/lib/orders-list-cache";
import { OrderTrackingModal } from "@/components/OrderTrackingModal";
import { OrderFollowUpModal } from "@/components/OrderFollowUpModal";
import type { WhatsAppMessageTemplate } from "@/lib/whatsapp/message-templates";

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

const SOURCE_TABS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "shopify", label: "Shopify" },
  { value: "whatsapp_ai", label: "WhatsApp" },
];

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
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

function orderTotalQty(order: Order): number {
  return (order.items ?? []).reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity) || 0),
    0
  );
}

function formatOrderItemsSummary(order: Order): string {
  const items = order.items ?? [];
  if (!items.length) return "—";
  return items
    .map((item) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const title = item.title?.trim() || "Item";
      return qty > 1 ? `${title} ×${qty}` : title;
    })
    .join(", ");
}

function recoveryDealBadge(order: Order): string | null {
  if (order.recovery_deal_type === "discount") {
    const pct = order.recovery_discount_percent;
    return pct ? `AI discount ${pct}%` : "AI discount";
  }
  if (order.recovery_deal_type === "bundle") {
    const pct = order.recovery_discount_percent;
    return pct ? `AI 2-pack ${pct}%` : "AI 2-pack bundle";
  }
  return null;
}

export function formatShippingAddress(
  addr?: OrderShippingAddress | null
): string {
  if (!addr) return "—";
  const parts = [
    addr.address1,
    addr.address2,
    addr.city,
    addr.province,
    addr.zip,
    addr.country,
  ].filter((p) => typeof p === "string" && p.trim());
  if (parts.length === 0) {
    return addr.name?.trim() || "—";
  }
  return parts.join(", ");
}

export function formatFullShippingAddress(
  addr?: OrderShippingAddress | null
): { lines: string[]; empty: boolean } {
  if (!addr) return { lines: [], empty: true };
  const lines = [
    addr.name?.trim() ? `Name: ${addr.name.trim()}` : null,
    addr.phone?.trim() ? `Phone: ${addr.phone.trim()}` : null,
    addr.address1?.trim() || null,
    addr.address2?.trim() || null,
    [addr.city, addr.province, addr.zip]
      .filter((p) => typeof p === "string" && p.trim())
      .join(", ") || null,
    addr.country?.trim() || null,
  ].filter((p): p is string => Boolean(p && p.trim()));
  return { lines, empty: lines.length === 0 };
}

function OrderAddressButton({
  order,
  onOpen,
  className,
}: {
  order: Order;
  onOpen: () => void;
  className?: string;
}) {
  const text = formatShippingAddress(order.shipping_address);
  const hasAddress = text !== "—";
  if (!hasAddress) {
    return <span className={className}>—</span>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Tap to view full address"
      className={`text-left text-emerald-700 underline-offset-2 hover:underline ${className ?? ""}`}
    >
      {text}
    </button>
  );
}

function OrderAddressModal({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const { lines, empty } = formatFullShippingAddress(order.shipping_address);
  const orderLabel = order.order_number ?? order.id.slice(0, 8);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-address-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="order-address-title"
              className="text-base font-bold text-slate-900"
            >
              Delivery address
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">Order {orderLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        {empty ? (
          <p className="mt-4 text-sm text-slate-500">No address on this order.</p>
        ) : (
          <div className="mt-4 space-y-1.5 text-sm leading-relaxed text-slate-800">
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        {(order.customers?.name || order.customers?.phone) && (
          <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Customer on file</p>
            {order.customers?.name && <p>{order.customers.name}</p>}
            {order.customers?.phone && <p>{order.customers.phone}</p>}
          </div>
        )}
      </div>
    </div>
  );
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
  const initialSource: SourceFilter = existing?.lastSource ?? "all";
  const initialDatePreset: DatePreset = existing?.lastDatePreset ?? "all";
  const initialRange = dateRangeFromPreset(
    initialDatePreset,
    existing?.lastDateFrom,
    existing?.lastDateTo
  );
  const initialCached = getCachedPage(
    initialSource,
    initialStatus,
    initialRange.dateFrom,
    initialRange.dateTo,
    initialPage,
    ORDERS_PAGE_SIZE
  );

  const [orders, setOrders] = useState<Order[]>(initialCached?.orders ?? []);
  const [loading, setLoading] = useState(!initialCached);
  const [syncing, setSyncing] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(ORDERS_PAGE_SIZE);
  const [pageSizeInput, setPageSizeInput] = useState(String(ORDERS_PAGE_SIZE));
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
  const [sourceFilter, setSourceFilter] =
    useState<SourceFilter>(initialSource);
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>(initialDatePreset);
  const [customFrom, setCustomFrom] = useState(
    existing?.lastDateFrom?.slice(0, 10) ?? ""
  );
  const [customTo, setCustomTo] = useState(
    existing?.lastDateTo?.slice(0, 10) ?? ""
  );
  const [statusCounts, setStatusCounts] = useState(
    existing?.statusCounts ?? {
      all: 0,
      pending: 0,
      confirmed: 0,
      cancelled: 0,
    }
  );
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);
  const [followUpOrder, setFollowUpOrder] = useState<Order | null>(null);
  const [addressOrder, setAddressOrder] = useState<Order | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkFollowUp, setShowBulkFollowUp] = useState(false);
  const [bulkTemplates, setBulkTemplates] = useState<WhatsAppMessageTemplate[]>(
    []
  );
  const [bulkTemplateId, setBulkTemplateId] = useState("");
  const [bulkTemplatesLoading, setBulkTemplatesLoading] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [bulkFollowUpError, setBulkFollowUpError] = useState<string | null>(
    null
  );
  const [bulkFollowUpResults, setBulkFollowUpResults] = useState<{
    sent: number;
    failed: number;
    results: Array<{
      orderId: string;
      ok: boolean;
      error?: string;
      to?: string;
    }>;
  } | null>(null);

  const [autoConfirmOrders, setAutoConfirmOrders] = useState(false);
  const [autoFollowUpTemplateId, setAutoFollowUpTemplateId] = useState<
    string | null
  >(null);
  const [approvedWaTemplates, setApprovedWaTemplates] = useState<
    WhatsAppMessageTemplate[]
  >([]);
  const [orderSettingsLoading, setOrderSettingsLoading] = useState(true);
  const [orderSettingsSaving, setOrderSettingsSaving] = useState(false);

  const nextPageInfoRef = useRef<string | null>(existing?.nextPageInfo ?? null);
  const syncedPagesRef = useRef(existing?.syncedPages ?? 0);
  const shopifyTotalRef = useRef(existing?.shopifyTotal ?? 0);
  const statusCountsRef = useRef(statusCounts);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  const initialLoadDoneRef = useRef(false);

  const { store, refresh: refreshStore } = useStoreStatus();
  const searchParams = useSearchParams();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadOrderSettings() {
      setOrderSettingsLoading(true);
      try {
        const res = await fetch("/api/store/order-settings");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load settings");
        if (cancelled) return;
        setAutoConfirmOrders(Boolean(data.autoConfirmOrders));
        setAutoFollowUpTemplateId(data.autoFollowUpTemplateId ?? null);
        setApprovedWaTemplates(data.approvedTemplates ?? []);
      } catch {
        // Non-blocking — orders still work without settings
      } finally {
        if (!cancelled) setOrderSettingsLoading(false);
      }
    }
    void loadOrderSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  // Clear selection when page or filters change (not on silent auto-refresh)
  useEffect(() => {
    setSelectedIds(new Set());
    setShowBulkFollowUp(false);
    setBulkFollowUpResults(null);
  }, [page, pageSize, statusFilter, sourceFilter, datePreset, customFrom, customTo, debouncedSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(customerSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const applyPage = useCallback(
    (
      nextOrders: Order[],
      p: number,
      source: SourceFilter,
      status: StatusFilter,
      dateFrom: string | null,
      dateTo: string | null,
      filtered: number,
      pages: number,
      shopify: number,
      counts: typeof statusCounts,
      preset: DatePreset,
      cachePageSize: number = pageSize
    ) => {
      if (!mountedRef.current) return;
      const resolvedPages = Math.max(
        1,
        pages,
        filtered > 0 ? Math.ceil(filtered / cachePageSize) : 0,
        nextOrders.length >= cachePageSize ? p + 1 : 0
      );
      setOrders(nextOrders);
      setFilteredTotal(filtered);
      setTotalPages(resolvedPages);
      setShopifyTotal(shopify);
      setStatusCounts(counts);
      shopifyTotalRef.current = shopify;
      statusCountsRef.current = counts;

      setCachedPage(
        source,
        status,
        dateFrom,
        dateTo,
        p,
        {
          orders: nextOrders,
          filteredTotal: filtered,
          totalPages: resolvedPages,
        },
        {
          shopifyTotal: shopify,
          statusCounts: counts,
          nextPageInfo: nextPageInfoRef.current,
          syncedPages: syncedPagesRef.current,
          lastStatus: status,
          lastSource: source,
          lastDatePreset: preset,
          lastDateFrom: dateFrom,
          lastDateTo: dateTo,
          lastPage: p,
        },
        cachePageSize
      );
    },
    [pageSize]
  );

  const buildQuery = useCallback(
    (
      p: number,
      source: SourceFilter,
      status: StatusFilter,
      rangeOverride?: { dateFrom: string | null; dateTo: string | null; preset?: DatePreset },
      limitOverride?: number
    ) => {
      const range =
        rangeOverride ??
        dateRangeFromPreset(
          customFrom || customTo ? "custom" : datePreset,
          customFrom || null,
          customTo || null
        );
      const limit = Math.min(
        100,
        Math.max(1, Math.floor(limitOverride ?? pageSize))
      );
      const params = new URLSearchParams({
        page: String(p),
        limit: String(limit),
        status,
      });
      if (source !== "all") params.set("source", source);
      if (range.dateFrom) params.set("dateFrom", range.dateFrom);
      if (range.dateTo) params.set("dateTo", range.dateTo);
      if (debouncedSearch) params.set("search", debouncedSearch);
      return {
        params,
        range,
        preset: rangeOverride?.preset ?? (customFrom || customTo ? "custom" as DatePreset : datePreset),
        limit,
      };
    },
    [customFrom, customTo, datePreset, debouncedSearch, pageSize]
  );

  /** Background: refresh Shopify total count (does not block UI). */
  const refreshShopifyTotal = useCallback(async () => {
    // Disabled on automatic page loads — only called explicitly via Refresh
  }, []);

  const syncOneShopifyPage = useCallback(async () => {
    if (!store?.shopify_connected) return;
    if (syncedPagesRef.current >= 1 && nextPageInfoRef.current === null) {
      return;
    }
    if (syncedPagesRef.current >= 1) return;

    setSyncing(true);
    try {
      const res = await fetch("/api/orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: pageSize }),
      });
      const data = await res.json();
      if (!res.ok) return;

      nextPageInfoRef.current = data.nextPageInfo ?? null;
      syncedPagesRef.current = 1;
      if (typeof data.shopifyTotal === "number") {
        shopifyTotalRef.current = data.shopifyTotal;
        if (mountedRef.current) {
          setShopifyTotal(data.shopifyTotal);
        }
      }
    } catch {
      // ignore
    } finally {
      if (mountedRef.current) setSyncing(false);
    }
  }, [store?.shopify_connected, pageSize]);

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
              limit: pageSize,
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
    [store?.shopify_connected, pageSize]
  );

  const loadPage = useCallback(
    async (
      p: number,
      source: SourceFilter,
      status: StatusFilter,
      options?: {
        force?: boolean;
        showLoading?: boolean;
        backgroundSync?: boolean;
        limitOverride?: number;
        rangeOverride?: {
          dateFrom: string | null;
          dateTo: string | null;
          preset?: DatePreset;
        };
      }
    ) => {
      const force = options?.force ?? false;
      const showLoading = options?.showLoading ?? true;
      const effectivePageSize = Math.min(
        100,
        Math.max(1, Math.floor(options?.limitOverride ?? pageSize))
      );

      const { params, range, preset } = buildQuery(
        p,
        source,
        status,
        options?.rangeOverride,
        effectivePageSize
      );

      if (!force && !debouncedSearch) {
        const hit = getCachedPage(
          source,
          status,
          range.dateFrom,
          range.dateTo,
          p,
          effectivePageSize
        );
        if (hit) {
          applyPage(
            hit.orders,
            p,
            source,
            status,
            range.dateFrom,
            range.dateTo,
            hit.filteredTotal,
            hit.totalPages,
            shopifyTotalRef.current,
            statusCountsRef.current,
            preset
          );
          void refreshShopifyTotal();
          return;
        }
      }

      if (loadingRef.current && !force) return;
      loadingRef.current = true;
      if (showLoading && mountedRef.current) setLoading(true);
      if (mountedRef.current) setError(null);

      try {
        const res = await fetch(`/api/orders?${params}`);
        if (!res.ok) throw new Error("Failed to load orders");
        const data = await res.json();

        const nextOrders: Order[] = data.orders ?? [];
        const filtered = data.total ?? 0;
        const counts = data.statusCounts ?? statusCountsRef.current;
        const shopify = shopifyTotalRef.current;
        let pages = Math.max(
          1,
          data.totalPages ?? 1,
          filtered > 0 ? Math.ceil(filtered / effectivePageSize) : 0
        );
        if (
          status === "all" &&
          source === "all" &&
          !range.dateFrom &&
          !range.dateTo &&
          shopify > 0
        ) {
          pages = Math.max(pages, Math.ceil(shopify / effectivePageSize));
        } else if (status === "all" && counts.all > 0) {
          pages = Math.max(pages, Math.ceil(counts.all / effectivePageSize));
        }
        if (nextOrders.length >= effectivePageSize && pages <= p) {
          pages = p + 1;
        }

        // Keep pageSize state aligned with what we actually fetched
        if (
          options?.limitOverride != null &&
          options.limitOverride !== pageSize
        ) {
          setPageSize(effectivePageSize);
          setPageSizeInput(String(effectivePageSize));
        }

        applyPage(
          nextOrders,
          p,
          source,
          status,
          range.dateFrom,
          range.dateTo,
          filtered,
          pages,
          shopify,
          counts,
          preset,
          effectivePageSize
        );
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        loadingRef.current = false;
        if (mountedRef.current && showLoading) setLoading(false);
      }

      // Shopify sync is no longer triggered automatically on page load.
      // Use the Refresh button for an explicit background sync.
    },
    [
      applyPage,
      buildQuery,
      debouncedSearch,
      pageSize,
    ]
  );

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
    // Prevent React StrictMode (or any re-mount) from firing this twice
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;

    const { range } = buildQuery(page, sourceFilter, statusFilter);
    const hit = getCachedPage(
      sourceFilter,
      statusFilter,
      range.dateFrom,
      range.dateTo,
      page,
      pageSize
    );
    if (hit) {
      applyPage(
        hit.orders,
        page,
        sourceFilter,
        statusFilter,
        range.dateFrom,
        range.dateTo,
        hit.filteredTotal,
        hit.totalPages,
        shopifyTotalRef.current || (getOrdersListCache()?.shopifyTotal ?? 0),
        statusCountsRef.current,
        datePreset
      );
      setLoading(false);
      return;
    }

    loadPage(page, sourceFilter, statusFilter, {
      showLoading: true,
      backgroundSync: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id]);

  useEffect(() => {
    if (!store) return;
    const interval = setInterval(() => {
      loadPage(page, sourceFilter, statusFilter, {
        force: true,
        showLoading: false,
        backgroundSync: false,
      });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [store, page, pageSize, statusFilter, sourceFilter, loadPage]);

  useEffect(() => {
    if (!store) return;
    setPage(1);
    void loadPage(1, sourceFilter, statusFilter, {
      force: true,
      showLoading: true,
      backgroundSync: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

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
      await loadPage(page, sourceFilter, statusFilter, {
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

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    const allSelected =
      orders.length > 0 && orders.every((o) => selectedIds.has(o.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    }
  }

  async function openBulkFollowUp() {
    setBulkFollowUpError(null);
    setBulkFollowUpResults(null);
    setBulkProgress(null);
    if (selectedIds.size === 0) return;

    setShowBulkFollowUp(true);
    setBulkTemplatesLoading(true);
    try {
      const res = await fetch("/api/orders/bulk-follow-up");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load templates");
      const list = (data.templates ?? []) as WhatsAppMessageTemplate[];
      setBulkTemplates(list);
      setBulkTemplateId(list[0]?.id ?? "");
    } catch (err) {
      setBulkFollowUpError(
        err instanceof Error ? err.message : "Failed to load templates"
      );
      setBulkTemplates([]);
    } finally {
      setBulkTemplatesLoading(false);
    }
  }

  async function sendBulkFollowUp() {
    if (!bulkTemplateId || selectedIds.size === 0) return;
    setBulkSending(true);
    setBulkFollowUpError(null);
    setBulkFollowUpResults(null);
    setBulkProgress(`Sending to ${selectedIds.size} order(s)...`);

    try {
      const res = await fetch("/api/orders/bulk-follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: Array.from(selectedIds),
          templateId: bulkTemplateId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Follow-up failed");
      setBulkFollowUpResults({
        sent: data.sent ?? 0,
        failed: data.failed ?? 0,
        results: data.results ?? [],
      });
      setBulkProgress(
        `Done: ${data.sent ?? 0} sent, ${data.failed ?? 0} failed.`
      );
      setSuccessMsg(
        `Follow-up sent to ${data.sent ?? 0} order${
          (data.sent ?? 0) === 1 ? "" : "s"
        }${data.failed ? ` (${data.failed} failed)` : ""}.`
      );
    } catch (err) {
      setBulkFollowUpError(
        err instanceof Error ? err.message : "Follow-up failed"
      );
      setBulkProgress(null);
    } finally {
      setBulkSending(false);
    }
  }

  async function saveOrderSettings(next: {
    autoConfirmOrders?: boolean;
    autoFollowUpTemplateId?: string | null;
  }) {
    setOrderSettingsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/store/order-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings");
      if (next.autoConfirmOrders !== undefined) {
        setAutoConfirmOrders(next.autoConfirmOrders);
      }
      if (next.autoFollowUpTemplateId !== undefined) {
        setAutoFollowUpTemplateId(next.autoFollowUpTemplateId);
      }
      setSuccessMsg("Order settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setOrderSettingsSaving(false);
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
    // 1. Immediately show local DB orders
    await loadPage(page, sourceFilter, statusFilter, {
      force: true,
      showLoading: true,
      backgroundSync: false,
    });
    setSuccessMsg("Orders updated.");

    // 2. Kick off Shopify sync in background (non-blocking)
    if (store?.shopify_connected) {
      setSyncing(true);
      syncOneShopifyPage()
        .then(() =>
          loadPage(page, sourceFilter, statusFilter, {
            force: true,
            showLoading: false,
            backgroundSync: false,
          })
        )
        .catch(() => {})
        .finally(() => {
          if (mountedRef.current) setSyncing(false);
        });
    }
  }

  function changeFilter(next: StatusFilter) {
    if (next === statusFilter) return;
    setStatusFilter(next);
    setPage(1);
    setSuccessMsg(null);
    loadPage(1, sourceFilter, next, {
      showLoading: true,
      backgroundSync: false,
    });
  }

  function changeSource(next: SourceFilter) {
    if (next === sourceFilter) return;
    setSourceFilter(next);
    setPage(1);
    setSuccessMsg(null);
    loadPage(1, next, statusFilter, {
      showLoading: true,
      backgroundSync: false,
    });
  }

  function changeDatePreset(next: DatePreset) {
    setDatePreset(next);
    if (next !== "custom") {
      setCustomFrom("");
      setCustomTo("");
    }
    setPage(1);
    setSuccessMsg(null);
    const range = dateRangeFromPreset(next, null, null);
    void loadPage(1, sourceFilter, statusFilter, {
      force: true,
      showLoading: true,
      backgroundSync: false,
      rangeOverride: { ...range, preset: next },
    });
  }

  function applyCustomDates() {
    setDatePreset("custom");
    setPage(1);
    setSuccessMsg(null);
    const range = dateRangeFromPreset(
      "custom",
      customFrom || null,
      customTo || null
    );
    void loadPage(1, sourceFilter, statusFilter, {
      force: true,
      showLoading: true,
      backgroundSync: false,
      rangeOverride: { ...range, preset: "custom" },
    });
  }

  async function goToPage(p: number) {
    const pagesAvailable = Math.max(
      totalPages,
      filteredTotal > 0 ? Math.ceil(filteredTotal / pageSize) : 1
    );
    const target = Math.max(1, Math.floor(p));
    if (target === page) return;
    if (target > pagesAvailable) return;

    setSuccessMsg(null);
    setPage(target);

    try {
      if (
        statusFilter === "all" &&
        sourceFilter !== "whatsapp_ai" &&
        store?.shopify_connected
      ) {
        await ensureSyncedThroughPage(target);
      }
      await loadPage(target, sourceFilter, statusFilter, {
        force: true,
        showLoading: true,
        backgroundSync: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load page");
    }
  }

  function applyRowsPerPage(raw: string | number) {
    const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n)) {
      setPageSizeInput(String(pageSize));
      return;
    }
    const next = Math.min(100, Math.max(1, Math.floor(n)));
    setPageSizeInput(String(next));
    setPageSize(next);
    setPage(1);
    clearOrdersListCache();
    syncedPagesRef.current = 0;
    nextPageInfoRef.current = null;
    setSuccessMsg(null);
    // Fetch immediately with the new limit (don't wait for state/effect)
    void loadPage(1, sourceFilter, statusFilter, {
      force: true,
      showLoading: true,
      backgroundSync: false,
      limitOverride: next,
    });
  }

  async function handleExport() {
    const { params } = buildQuery(1, sourceFilter, statusFilter);
    params.delete("page");
    params.delete("limit");
    try {
      const res = await fetch(`/api/orders/export?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccessMsg("Orders exported.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/orders/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      clearOrdersListCache();
      setSuccessMsg(
        `Imported ${data.created} order${data.created === 1 ? "" : "s"}${
          data.failed ? ` (${data.failed} failed)` : ""
        }.`
      );
      await loadPage(1, sourceFilter, statusFilter, {
        force: true,
        showLoading: true,
        backgroundSync: false,
      });
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  if (!store) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Loading store...
      </div>
    );
  }

  const allPageSelected =
    orders.length > 0 && orders.every((o) => selectedIds.has(o.id));

  // Derive from matching count so Next isn't stuck when totalPages was wrong/stale
  const effectiveTotalPages = Math.max(
    1,
    totalPages,
    filteredTotal > 0 ? Math.ceil(filteredTotal / pageSize) : 0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs text-slate-500">
            {shopifyTotal > 0 && sourceFilter !== "whatsapp_ai" ? (
              <>
                <span className="font-semibold text-slate-700">
                  {shopifyTotal.toLocaleString()}
                </span>{" "}
                on Shopify
                {orders.length > 0 && (
                  <>
                    {" · "}
                    showing {(page - 1) * pageSize + 1}–
                    {(page - 1) * pageSize + orders.length} ({pageSize} per
                    page)
                  </>
                )}
              </>
            ) : (
              <>
                <span className="font-semibold text-slate-700">
                  {statusCounts.all.toLocaleString()}
                </span>{" "}
                matching filters
              </>
            )}
            {statusFilter !== "all" && filteredTotal > 0
              ? ` · ${filteredTotal.toLocaleString()} ${statusFilter}`
              : ""}
          </p>
          {!store.shopify_connected && (
            <p className="mt-1 text-xs text-amber-700">
              Shopify not connected — showing WhatsApp / portal orders only.{" "}
              <Link
                href="/dashboard/integrations/shopify"
                className="font-semibold underline"
              >
                Connect Shopify
              </Link>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {importing ? "Importing..." : "Import"}
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export
          </button>
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
      </div>

      <div className="flex flex-wrap gap-2">
        {SOURCE_TABS.map((tab) => {
          const active = sourceFilter === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => changeSource(tab.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                active
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
        <div className="ml-auto w-full sm:w-64">
          <input
            type="search"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            aria-label="Search orders by customer name or phone"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {DATE_PRESETS.map((preset) => {
          const active =
            datePreset === preset.value && !customFrom && !customTo;
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => changeDatePreset(preset.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
        <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase text-slate-500">
          From
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-800"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase text-slate-500">
          To
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-800"
          />
        </label>
        <button
          type="button"
          onClick={applyCustomDates}
          disabled={!customFrom && !customTo}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Apply dates
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => {
          const active = statusFilter === filter.value;
          const count =
            filter.value === "all"
              ? statusCounts.all
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

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={autoConfirmOrders}
                disabled={orderSettingsLoading || orderSettingsSaving}
                onClick={() =>
                  void saveOrderSettings({
                    autoConfirmOrders: !autoConfirmOrders,
                  })
                }
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                  autoConfirmOrders ? "bg-emerald-500" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    autoConfirmOrders ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Auto-confirm Shopify orders
                </p>
                {orderSettingsLoading ? (
                  <p className="text-xs text-slate-500">Loading settings…</p>
                ) : autoConfirmOrders ? (
                  <p className="mt-0.5 text-xs text-slate-600">
                    New Shopify orders are confirmed automatically. The customer
                    gets a confirmation/dispatch WhatsApp message, plus an
                    optional follow-up template below.
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-600">
                    AI confirmation mode — new Shopify orders get a WhatsApp
                    message asking the customer to CONFIRM or CANCEL. On
                    confirm, the order is punched; on cancel, AI follows your
                    Shopify confirmation instructions (discounts/bundles).
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
        {autoConfirmOrders && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Optional follow-up template
            </label>
            <select
              value={autoFollowUpTemplateId ?? ""}
              disabled={orderSettingsSaving}
              onChange={(e) =>
                void saveOrderSettings({
                  autoFollowUpTemplateId: e.target.value || null,
                })
              }
              className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 disabled:opacity-50"
            >
              <option value="">None — confirmation message only</option>
              {approvedWaTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.language}
                </option>
              ))}
            </select>
            {approvedWaTemplates.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-700">
                No approved WhatsApp templates yet. Submit one under WA
                Templates and wait for Meta approval.
              </p>
            )}
          </div>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <p className="text-sm font-semibold text-violet-950">
            {selectedIds.size} order{selectedIds.size === 1 ? "" : "s"} selected
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedIds(new Set());
                setShowBulkFollowUp(false);
              }}
              className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-sm font-medium text-violet-900"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={openBulkFollowUp}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700"
            >
              Follow-up ({selectedIds.size})
            </button>
          </div>
        </div>
      )}

      {showBulkFollowUp && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1 space-y-2">
              <p className="text-sm font-semibold text-violet-950">
                Bulk follow-up · {selectedIds.size} selected
              </p>
              {bulkTemplatesLoading ? (
                <p className="text-sm text-violet-800">Loading templates...</p>
              ) : bulkTemplates.length === 0 ? (
                <p className="text-sm text-violet-800">
                  No approved WhatsApp templates. Create and get Meta approval
                  under WA Templates.
                </p>
              ) : (
                <select
                  value={bulkTemplateId}
                  onChange={(e) => setBulkTemplateId(e.target.value)}
                  className="w-full max-w-md rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
                >
                  {bulkTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.language}
                    </option>
                  ))}
                </select>
              )}
              {bulkProgress && (
                <p className="text-sm font-medium text-violet-900">
                  {bulkProgress}
                </p>
              )}
              {bulkFollowUpError && (
                <p className="text-sm text-red-700">{bulkFollowUpError}</p>
              )}
              {bulkFollowUpResults && bulkFollowUpResults.failed > 0 && (
                <ul className="max-h-32 overflow-y-auto text-xs text-red-800">
                  {bulkFollowUpResults.results
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <li key={r.orderId}>
                        {r.orderId.slice(0, 8)}… — {r.error}
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowBulkFollowUp(false);
                  setBulkFollowUpResults(null);
                  setBulkProgress(null);
                }}
                className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-900"
              >
                Close
              </button>
              <button
                type="button"
                disabled={
                  bulkSending ||
                  !bulkTemplateId ||
                  bulkTemplates.length === 0
                }
                onClick={sendBulkFollowUp}
                className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {bulkSending ? "Sending..." : "Send now"}
              </button>
            </div>
          </div>
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
                  <th className="px-3 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleAllOnPage}
                      aria-label="Select all on page"
                      className="rounded border-slate-300"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Order
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Address
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Products
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Qty
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
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(order.id)}
                        onChange={() => toggleId(order.id)}
                        aria-label={`Select order ${order.order_number ?? order.id}`}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">
                        {order.order_number ?? order.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-slate-500">{order.source}</p>
                      {recoveryDealBadge(order) && (
                        <span className="mt-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                          {recoveryDealBadge(order)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <p>{order.customers?.name ?? "—"}</p>
                      {order.customers?.phone && (
                        <p className="text-xs text-slate-500">
                          {order.customers.phone}
                        </p>
                      )}
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-xs text-slate-600">
                      <span className="line-clamp-2">
                        <OrderAddressButton
                          order={order}
                          onOpen={() => setAddressOrder(order)}
                          className="line-clamp-2"
                        />
                      </span>
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-xs text-slate-700">
                      <span className="line-clamp-2">{formatOrderItemsSummary(order)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {orderTotalQty(order) || "—"}
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
                            className={
                              autoConfirmOrders
                                ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                                : "rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
                            }
                            title={
                              autoConfirmOrders
                                ? "Still pending — confirm manually"
                                : undefined
                            }
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
                        <button
                          type="button"
                          onClick={() => setFollowUpOrder(order)}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          Follow-up
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
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(order.id)}
                      onChange={() => toggleId(order.id)}
                      aria-label={`Select order ${order.order_number ?? order.id}`}
                      className="mt-1 rounded border-slate-300"
                    />
                    <div>
                      <p className="font-semibold text-slate-900">
                        {order.order_number ?? order.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {order.customers?.name ?? "Customer"} ·{" "}
                        {formatShortDate(order.created_at)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatOrderItemsSummary(order)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Qty: {orderTotalQty(order) || "—"}
                        {recoveryDealBadge(order)
                          ? ` · ${recoveryDealBadge(order)}`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        <OrderAddressButton
                          order={order}
                          onOpen={() => setAddressOrder(order)}
                          className="text-xs"
                        />
                      </p>
                    </div>
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
                  <button
                    type="button"
                    onClick={() => setFollowUpOrder(order)}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"
                  >
                    Follow-up
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {(effectiveTotalPages > 1 || orders.length > 0) && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-600">
              Page {page}
              {effectiveTotalPages > 0 ? ` of ${effectiveTotalPages}` : ""}
              {filteredTotal > 0
                ? ` · ${filteredTotal.toLocaleString()} matching`
                : ""}
            </p>
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <span className="whitespace-nowrap font-medium">Rows per page</span>
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                inputMode="numeric"
                value={pageSizeInput}
                onChange={(e) => setPageSizeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyRowsPerPage(pageSizeInput);
                  }
                }}
                className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                aria-label="Rows per page"
              />
              <button
                type="button"
                onClick={() => applyRowsPerPage(pageSizeInput)}
                disabled={loading}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void goToPage(page - 1)}
              disabled={page <= 1 || loading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void goToPage(page + 1)}
              disabled={page >= effectiveTotalPages || loading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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

      {addressOrder && (
        <OrderAddressModal
          order={addressOrder}
          onClose={() => setAddressOrder(null)}
        />
      )}

      {followUpOrder && (
        <OrderFollowUpModal
          order={followUpOrder}
          onClose={() => setFollowUpOrder(null)}
          onSent={(msg) => {
            setSuccessMsg(msg);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
