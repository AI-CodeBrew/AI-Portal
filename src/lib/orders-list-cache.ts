import type { Order, OrderSource, OrderStatus } from "@/lib/types";

export type StatusFilter = "all" | OrderStatus;
export type SourceFilter = "all" | OrderSource;
export type DatePreset = "all" | "7" | "30" | "90" | "custom";

export type OrdersPageCacheEntry = {
  orders: Order[];
  filteredTotal: number;
  totalPages: number;
  fetchedAt: number;
};

export type OrdersListCache = {
  shopifyTotal: number;
  statusCounts: {
    all: number;
    pending: number;
    confirmed: number;
    cancelled: number;
  };
  /** key = `${source}:${status}:${dateKey}:${pageSize}:${page}` */
  pages: Record<string, OrdersPageCacheEntry>;
  nextPageInfo: string | null;
  syncedPages: number;
  lastStatus: StatusFilter;
  lastSource: SourceFilter;
  lastDatePreset: DatePreset;
  lastDateFrom: string | null;
  lastDateTo: string | null;
  lastPage: number;
  fetchedAt: number;
};

const PAGE_TTL_MS = 5 * 60 * 1000;
const AUTO_REFRESH_MS = 10 * 60 * 1000;
/** Default page size for reseller orders list. */
export const ORDERS_PAGE_SIZE = 10;
export const ORDERS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

let cache: OrdersListCache | null = null;
const ORDERS_STORAGE_KEY = "portal:orders-list-cache:v1";

let ordersHydrationEnabled = false;

function hydrateOrdersCache() {
  if (!ordersHydrationEnabled || cache || typeof sessionStorage === "undefined") {
    return;
  }
  try {
    const raw = sessionStorage.getItem(ORDERS_STORAGE_KEY);
    if (!raw) return;
    cache = JSON.parse(raw) as OrdersListCache;
  } catch {
    cache = null;
  }
}

/** Call after mount so SSR/first paint cannot read sessionStorage. */
export function enableOrdersListCacheHydration() {
  ordersHydrationEnabled = true;
  hydrateOrdersCache();
}

function persistOrdersCache() {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (!cache) {
      sessionStorage.removeItem(ORDERS_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // quota / private mode
  }
}

export function pageCacheKey(
  source: SourceFilter,
  status: StatusFilter,
  dateFrom: string | null,
  dateTo: string | null,
  page: number,
  pageSize: number = ORDERS_PAGE_SIZE
): string {
  return `${source}:${status}:${dateFrom ?? ""}:${dateTo ?? ""}:${pageSize}:${page}`;
}

export function getOrdersListCache(): OrdersListCache | null {
  hydrateOrdersCache();
  return cache;
}

export function setOrdersListCache(next: OrdersListCache): void {
  cache = next;
  persistOrdersCache();
}

export function getCachedPage(
  source: SourceFilter,
  status: StatusFilter,
  dateFrom: string | null,
  dateTo: string | null,
  page: number,
  pageSize: number = ORDERS_PAGE_SIZE
): OrdersPageCacheEntry | null {
  if (!cache) return null;
  const entry =
    cache.pages[pageCacheKey(source, status, dateFrom, dateTo, page, pageSize)];
  if (!entry) return null;
  return entry;
}

export function setCachedPage(
  source: SourceFilter,
  status: StatusFilter,
  dateFrom: string | null,
  dateTo: string | null,
  page: number,
  entry: Omit<OrdersPageCacheEntry, "fetchedAt">,
  meta?: Partial<
    Pick<
      OrdersListCache,
      | "shopifyTotal"
      | "statusCounts"
      | "nextPageInfo"
      | "syncedPages"
      | "lastStatus"
      | "lastSource"
      | "lastDatePreset"
      | "lastDateFrom"
      | "lastDateTo"
      | "lastPage"
    >
  >,
  pageSize: number = ORDERS_PAGE_SIZE
): void {
  const pages = { ...(cache?.pages ?? {}) };
  pages[pageCacheKey(source, status, dateFrom, dateTo, page, pageSize)] = {
    ...entry,
    fetchedAt: Date.now(),
  };
  cache = {
    shopifyTotal: meta?.shopifyTotal ?? cache?.shopifyTotal ?? 0,
    statusCounts: meta?.statusCounts ??
      cache?.statusCounts ?? {
        all: 0,
        pending: 0,
        confirmed: 0,
        cancelled: 0,
      },
    pages,
    nextPageInfo:
      meta?.nextPageInfo !== undefined
        ? meta.nextPageInfo
        : (cache?.nextPageInfo ?? null),
    syncedPages: meta?.syncedPages ?? cache?.syncedPages ?? 0,
    lastStatus: meta?.lastStatus ?? status,
    lastSource: meta?.lastSource ?? source,
    lastDatePreset: meta?.lastDatePreset ?? cache?.lastDatePreset ?? "all",
    lastDateFrom: meta?.lastDateFrom !== undefined
      ? meta.lastDateFrom
      : (cache?.lastDateFrom ?? dateFrom),
    lastDateTo: meta?.lastDateTo !== undefined
      ? meta.lastDateTo
      : (cache?.lastDateTo ?? dateTo),
    lastPage: meta?.lastPage ?? page,
    fetchedAt: Date.now(),
  };
  persistOrdersCache();
}

export function isOrdersCacheFresh(): boolean {
  if (!cache) return false;
  return Date.now() - cache.fetchedAt < PAGE_TTL_MS;
}

export function patchCachedOrder(order: Partial<Order> & { id: string }): void {
  if (!cache) return;
  const pages = { ...cache.pages };
  for (const [key, page] of Object.entries(pages)) {
    const idx = page.orders.findIndex((o) => o.id === order.id);
    if (idx < 0) continue;
    const nextOrders = [...page.orders];
    nextOrders[idx] = { ...nextOrders[idx], ...order };
    pages[key] = { ...page, orders: nextOrders, fetchedAt: Date.now() };
  }
  cache = { ...cache, pages, fetchedAt: Date.now() };
  persistOrdersCache();
}

export function removeCachedOrder(orderId: string): void {
  if (!cache) return;
  const pages = { ...cache.pages };
  for (const [key, page] of Object.entries(pages)) {
    if (!page.orders.some((o) => o.id === orderId)) continue;
    pages[key] = {
      ...page,
      orders: page.orders.filter((o) => o.id !== orderId),
      filteredTotal: Math.max(0, page.filteredTotal - 1),
      fetchedAt: Date.now(),
    };
  }
  cache = { ...cache, pages, fetchedAt: Date.now() };
  persistOrdersCache();
}

export function clearOrdersListCache(): void {
  cache = null;
  persistOrdersCache();
}

export function dateRangeFromPreset(
  preset: DatePreset,
  customFrom?: string | null,
  customTo?: string | null
): { dateFrom: string | null; dateTo: string | null } {
  if (preset === "all") return { dateFrom: null, dateTo: null };
  if (preset === "custom") {
    return {
      dateFrom: customFrom || null,
      dateTo: customTo || null,
    };
  }
  const days = Number(preset);
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - days);
  return {
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
  };
}

export { AUTO_REFRESH_MS, PAGE_TTL_MS };
