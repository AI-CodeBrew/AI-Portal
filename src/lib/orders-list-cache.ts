import type { Order, OrderStatus } from "@/lib/types";

export type StatusFilter = "all" | OrderStatus;

export type OrdersListCache = {
  orders: Order[];
  page: number;
  totalPages: number;
  shopifyTotal: number;
  filteredTotal: number;
  statusFilter: StatusFilter;
  statusCounts: {
    all: number;
    pending: number;
    confirmed: number;
    cancelled: number;
  };
  nextPageInfo: string | null;
  syncedPages: number;
  fetchedAt: number;
};

const AUTO_REFRESH_MS = 10 * 60 * 1000;

let cache: OrdersListCache | null = null;

export function getOrdersListCache(): OrdersListCache | null {
  return cache;
}

export function setOrdersListCache(next: OrdersListCache): void {
  cache = next;
}

export function isOrdersCacheFresh(): boolean {
  if (!cache) return false;
  return Date.now() - cache.fetchedAt < AUTO_REFRESH_MS;
}

export function clearOrdersListCache(): void {
  cache = null;
}

export { AUTO_REFRESH_MS };
