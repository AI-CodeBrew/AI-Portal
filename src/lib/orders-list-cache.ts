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
  /** key = `${source}:${status}:${dateKey}:${page}` */
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
export const ORDERS_PAGE_SIZE = 50;

let cache: OrdersListCache | null = null;

export function pageCacheKey(
  source: SourceFilter,
  status: StatusFilter,
  dateFrom: string | null,
  dateTo: string | null,
  page: number
): string {
  return `${source}:${status}:${dateFrom ?? ""}:${dateTo ?? ""}:${page}`;
}

export function getOrdersListCache(): OrdersListCache | null {
  return cache;
}

export function setOrdersListCache(next: OrdersListCache): void {
  cache = next;
}

export function getCachedPage(
  source: SourceFilter,
  status: StatusFilter,
  dateFrom: string | null,
  dateTo: string | null,
  page: number
): OrdersPageCacheEntry | null {
  if (!cache) return null;
  const entry = cache.pages[pageCacheKey(source, status, dateFrom, dateTo, page)];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > PAGE_TTL_MS) return null;
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
  >
): void {
  const pages = { ...(cache?.pages ?? {}) };
  pages[pageCacheKey(source, status, dateFrom, dateTo, page)] = {
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
}

export function isOrdersCacheFresh(): boolean {
  if (!cache) return false;
  return Date.now() - cache.fetchedAt < PAGE_TTL_MS;
}

export function clearOrdersListCache(): void {
  cache = null;
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
