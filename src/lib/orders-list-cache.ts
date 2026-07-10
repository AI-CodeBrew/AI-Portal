import type { Order, OrderStatus } from "@/lib/types";

export type StatusFilter = "all" | OrderStatus;

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
  /** key = `${status}:${page}` */
  pages: Record<string, OrdersPageCacheEntry>;
  nextPageInfo: string | null;
  syncedPages: number;
  lastStatus: StatusFilter;
  lastPage: number;
  fetchedAt: number;
};

const PAGE_TTL_MS = 5 * 60 * 1000;
const AUTO_REFRESH_MS = 10 * 60 * 1000;

let cache: OrdersListCache | null = null;

export function pageCacheKey(status: StatusFilter, page: number): string {
  return `${status}:${page}`;
}

export function getOrdersListCache(): OrdersListCache | null {
  return cache;
}

export function setOrdersListCache(next: OrdersListCache): void {
  cache = next;
}

export function getCachedPage(
  status: StatusFilter,
  page: number
): OrdersPageCacheEntry | null {
  if (!cache) return null;
  const entry = cache.pages[pageCacheKey(status, page)];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > PAGE_TTL_MS) return null;
  return entry;
}

export function setCachedPage(
  status: StatusFilter,
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
      | "lastPage"
    >
  >
): void {
  const pages = { ...(cache?.pages ?? {}) };
  pages[pageCacheKey(status, page)] = { ...entry, fetchedAt: Date.now() };
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
    lastPage: meta?.lastPage ?? page,
    fetchedAt: Date.now(),
  };
}

export function isOrdersCacheFresh(): boolean {
  if (!cache) return false;
  return Date.now() - cache.fetchedAt < PAGE_TTL_MS;
}

export function clearOrdersListCache(): void {
  cache = null;
}

export { AUTO_REFRESH_MS, PAGE_TTL_MS };
