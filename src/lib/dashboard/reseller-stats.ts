import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreAiUsage } from "@/lib/ai/quota";
import { DEFAULT_ORDER_TEMPLATE_ID } from "@/lib/ai/ai-settings-types";
import { isLlmProviderConfigured } from "@/lib/platform/llm-settings";
import { getStoreOrderTotals } from "@/lib/orders/store-order-totals";
import { countStoreProducts } from "@/lib/products/products-service";
import { getEffectiveStoreCurrency } from "@/lib/currency";
import {
  DASHBOARD_PERIODS,
  type DashboardPeriodId,
} from "@/lib/dashboard/period";

export type { DashboardPeriodId };
export { DASHBOARD_PERIODS };

/** Hide leftover Shopify-synced orders when the store is disconnected. */
function scopeOrdersQuery<T>(query: T, shopifyConnected: boolean): T {
  if (shopifyConnected) return query;
  return (query as { neq: (column: string, value: string) => T }).neq(
    "source",
    "shopify"
  );
}

export interface DashboardSetupStep {
  id: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
}

export interface DashboardRecentOrder {
  id: string;
  order_number: string | null;
  status: string;
  total: number | null;
  currency: string | null;
  created_at: string;
  customer_name: string | null;
}

export interface DashboardRecentChat {
  id: string;
  customer_phone: string;
  status: string;
  updated_at: string;
  last_message: string | null;
}

export interface DashboardDayPoint {
  date: string;
  label: string;
  conversations: number;
  orders: number;
}

export interface DashboardTopProduct {
  title: string;
  orders: number;
  quantity: number;
  revenue: number;
}

export interface DashboardProductSku {
  sku: string;
  title: string;
  source: "portal" | "shopify";
  createdAt: string | null;
}

export interface PeriodMetric {
  current: number;
  previous: number;
  deltaPercent: number | null;
}

type ResolvedDashboardPeriod = {
  id: DashboardPeriodId;
  label: string;
  compareLabel: string | null;
  currentStartIso: string | null;
  currentEndExclusiveIso: string | null;
  previousStartIso: string | null;
  previousEndExclusiveIso: string | null;
  chart: { from: Date; buckets: number; grain: "hour" | "day" };
};

export interface ResellerDashboardStats {
  range: {
    id: DashboardPeriodId;
    label: string;
    compareLabel: string | null;
  };
  store: {
    name: string;
    shop_domain: string | null;
    shopify_connected: boolean;
    whatsapp_connected: boolean;
    meta_connected: boolean;
    currency: string;
  };
  setup: {
    percentComplete: number;
    completedCount: number;
    totalCount: number;
    steps: DashboardSetupStep[];
  };
  period: {
    conversations: PeriodMetric;
    ordersCreated: PeriodMetric;
    confirmedOrders: PeriodMetric;
    conversionRate: PeriodMetric;
    revenue: PeriodMetric & { currency: string };
  };
  chart: DashboardDayPoint[];
  orderStatus: {
    pending: number;
    confirmed: number;
    cancelled: number;
  };
  topProducts: DashboardTopProduct[];
  recentSkus: DashboardProductSku[];
  shareLink: null;
  orders: {
    pending: number;
    confirmed: number;
    cancelled: number;
    /** Best-known total (Shopify + WhatsApp-only when available) */
    total: number;
    synced: number;
    shopifyTotal: number | null;
    withTracking: number;
    recent: DashboardRecentOrder[];
  };
  inbox: {
    total: number;
    ai_handling: number;
    human_handoff: number;
    closed: number;
    recent: DashboardRecentChat[];
  };
  aiPerformance: {
    successRate: number;
    handledByAi: number;
    humanTakeover: number;
    closed: number;
  };
  ai: {
    planName: string;
    used: number;
    limit: number;
    percentUsed: number;
    limitReached: boolean;
    platformConfigured: boolean;
  };
  ads: {
    linkCount: number;
    totalClicks: number;
  };
  products: {
    total: number;
  };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number): Date {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekdayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function shortDateLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatHourLabel(hour: number): string {
  const h = hour % 12 || 12;
  return `${h}${hour < 12 ? "am" : "pm"}`;
}

function pointKeyFromIso(iso: string, grain: "hour" | "day"): string {
  const d = new Date(iso);
  if (grain === "day") return localDateKey(d);
  return `${localDateKey(d)}T${String(d.getHours()).padStart(2, "0")}`;
}

function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function periodMetric(current: number, previous: number): PeriodMetric {
  return {
    current,
    previous,
    deltaPercent: deltaPercent(current, previous),
  };
}

function withCreatedAtRange<
  Q extends { gte: (column: string, value: string) => Q; lt: (column: string, value: string) => Q },
>(query: Q, startIso: string | null, endExclusiveIso: string | null): Q {
  let next = query;
  if (startIso) next = next.gte("created_at", startIso);
  if (endExclusiveIso) next = next.lt("created_at", endExclusiveIso);
  return next;
}

function resolveDashboardPeriod(
  id: DashboardPeriodId,
  storeCreatedAt?: string | null
): ResolvedDashboardPeriod {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const storeStart = storeCreatedAt
    ? startOfDay(new Date(storeCreatedAt))
    : daysAgo(89);
  const meta = DASHBOARD_PERIODS.find((p) => p.id === id) ?? DASHBOARD_PERIODS[0];

  const rolling = (days: number, compareLabel: string): ResolvedDashboardPeriod => {
    const currentStart = daysAgo(days - 1);
    return {
      id,
      label: meta.label,
      compareLabel,
      currentStartIso: currentStart.toISOString(),
      currentEndExclusiveIso: tomorrow.toISOString(),
      previousStartIso: daysAgo(days * 2 - 1).toISOString(),
      previousEndExclusiveIso: currentStart.toISOString(),
      chart: { from: currentStart, buckets: days, grain: "day" },
    };
  };

  switch (id) {
    case "today":
      return {
        id,
        label: meta.label,
        compareLabel: "vs yesterday",
        currentStartIso: today.toISOString(),
        currentEndExclusiveIso: tomorrow.toISOString(),
        previousStartIso: daysAgo(1).toISOString(),
        previousEndExclusiveIso: today.toISOString(),
        chart: { from: today, buckets: 24, grain: "hour" },
      };
    case "yesterday":
      return {
        id,
        label: meta.label,
        compareLabel: "vs the day before",
        currentStartIso: daysAgo(1).toISOString(),
        currentEndExclusiveIso: today.toISOString(),
        previousStartIso: daysAgo(2).toISOString(),
        previousEndExclusiveIso: daysAgo(1).toISOString(),
        chart: { from: daysAgo(1), buckets: 24, grain: "hour" },
      };
    case "7d":
      return rolling(7, "vs previous 7 days");
    case "30d":
      return rolling(30, "vs previous 30 days");
    case "90d":
      return rolling(90, "vs previous 90 days");
    case "all":
    default: {
      const from = storeStart.getTime() > today.getTime() ? today : storeStart;
      const dayCount = Math.round((today.getTime() - from.getTime()) / 86_400_000) + 1;
      const buckets = Math.min(90, Math.max(1, dayCount));
      const chartFrom = addDays(today, -(buckets - 1));
      return {
        id: "all",
        label: meta.label,
        compareLabel: null,
        currentStartIso: null,
        currentEndExclusiveIso: null,
        previousStartIso: null,
        previousEndExclusiveIso: null,
        chart: { from: chartFrom, buckets, grain: "day" },
      };
    }
  }
}

function emptyChartSeries(range: ResolvedDashboardPeriod): DashboardDayPoint[] {
  if (range.chart.grain === "hour") {
    const keyDay = localDateKey(range.chart.from);
    return Array.from({ length: 24 }, (_, hour) => ({
      date: `${keyDay}T${String(hour).padStart(2, "0")}`,
      label: hour % 3 === 0 ? formatHourLabel(hour) : "",
      conversations: 0,
      orders: 0,
    }));
  }

  const labelEvery = Math.max(1, Math.ceil(range.chart.buckets / 7));
  const points: DashboardDayPoint[] = [];
  for (let i = 0; i < range.chart.buckets; i++) {
    const d = addDays(range.chart.from, i);
    const key = localDateKey(d);
    const showLabel =
      range.chart.buckets <= 7 ||
      i === 0 ||
      i === range.chart.buckets - 1 ||
      i % labelEvery === 0;
    points.push({
      date: key,
      label: showLabel
        ? range.chart.buckets <= 7
          ? weekdayLabel(key)
          : shortDateLabel(key)
        : "",
      conversations: 0,
      orders: 0,
    });
  }
  return points;
}

export async function getResellerDashboardStats(
  storeId: string,
  period: DashboardPeriodId = "all"
): Promise<ResellerDashboardStats> {
  const supabase = createAdminClient();

  // Authoritative store currency — revenue is only summed for orders that
  // actually match it, so stray mismatched-currency rows (e.g. from before
  // the store-wide currency setting existed) don't silently corrupt the total.
  const effectiveCurrency = await getEffectiveStoreCurrency(storeId);

  // Parallelize store + ad links (was sequential ~2 round-trips)
  const [storeRes, adLinksQuery] = await Promise.all([
    supabase
      .from("stores")
      .select(
        "store_name, shop_domain, shopify_access_token, whatsapp_phone_number_id, whatsapp_access_token, meta_app_id, meta_app_secret, ai_agent_name, ai_opening_message, ai_order_template_id, created_at"
      )
      .eq("id", storeId)
      .single(),
    supabase
      .from("ad_whatsapp_links")
      .select(
        "id, slug, product_title, price, currency, click_count, prefill_message, created_at"
      )
      .eq("store_id", storeId)
      .order("click_count", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const store = storeRes.data;
  const range = resolveDashboardPeriod(period, store?.created_at);
  const emptyCount = { count: 0, data: null, error: null };

  const shopifyConnected = Boolean(store?.shopify_access_token);
  const whatsappConnected = Boolean(
    store?.whatsapp_phone_number_id && store?.whatsapp_access_token
  );
  const metaConnected = Boolean(store?.meta_app_id && store?.meta_app_secret);
  const businessInfoDone = Boolean(
    store?.store_name?.trim() || store?.shop_domain?.trim()
  );

  const adRows =
    adLinksQuery.error?.message.includes("ad_whatsapp_links") ||
    adLinksQuery.error?.code === "42P01"
      ? []
      : (adLinksQuery.data ?? []);

  const [
    pendingRes,
    confirmedRes,
    cancelledRes,
    trackingRes,
    convTotalRes,
    convAiRes,
    convHandoffRes,
    convClosedRes,
    chatExistsRes,
    recentOrdersRes,
    recentChatsRes,
    aiUsage,
    orderTotals,
    productCount,
    convCurrentRes,
    convPreviousRes,
    ordersCurrentRes,
    ordersPreviousRes,
    confirmedCurrentRes,
    confirmedPreviousRes,
    revenueCurrentRes,
    revenuePreviousRes,
    chartConvRes,
    chartOrdersRes,
    topOrdersRes,
  ] = await Promise.all([
    scopeOrdersQuery(
      withCreatedAtRange(
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("store_id", storeId)
          .eq("status", "pending"),
        range.currentStartIso,
        range.currentEndExclusiveIso
      ),
      shopifyConnected
    ),
    scopeOrdersQuery(
      withCreatedAtRange(
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("store_id", storeId)
          .eq("status", "confirmed"),
        range.currentStartIso,
        range.currentEndExclusiveIso
      ),
      shopifyConnected
    ),
    scopeOrdersQuery(
      withCreatedAtRange(
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("store_id", storeId)
          .eq("status", "cancelled"),
        range.currentStartIso,
        range.currentEndExclusiveIso
      ),
      shopifyConnected
    ),
    scopeOrdersQuery(
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId)
        .not("tracking_number", "is", null),
      shopifyConnected
    ),
    supabase
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId),
    supabase
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "ai_handling"),
    supabase
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "human_handoff"),
    supabase
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "closed"),
    supabase
      .from("whatsapp_conversations")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .limit(1),
    scopeOrdersQuery(
      supabase
        .from("orders")
        .select(
          "id, order_number, status, total, currency, created_at, customers(name)"
        )
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(5),
      shopifyConnected
    ),
    supabase
      .from("whatsapp_conversations")
      .select("id, customer_phone, status, updated_at")
      .eq("store_id", storeId)
      .order("updated_at", { ascending: false })
      .limit(5),
    getStoreAiUsage(storeId),
    getStoreOrderTotals(
      storeId,
      store?.shop_domain,
      store?.shopify_access_token
    ),
    countStoreProducts(storeId),
    withCreatedAtRange(
      supabase
        .from("whatsapp_conversations")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId),
      range.currentStartIso,
      range.currentEndExclusiveIso
    ),
    range.previousStartIso
      ? withCreatedAtRange(
          supabase
            .from("whatsapp_conversations")
            .select("*", { count: "exact", head: true })
            .eq("store_id", storeId),
          range.previousStartIso,
          range.previousEndExclusiveIso
        )
      : Promise.resolve(emptyCount),
    scopeOrdersQuery(
      withCreatedAtRange(
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("store_id", storeId),
        range.currentStartIso,
        range.currentEndExclusiveIso
      ),
      shopifyConnected
    ),
    range.previousStartIso
      ? scopeOrdersQuery(
          withCreatedAtRange(
            supabase
              .from("orders")
              .select("*", { count: "exact", head: true })
              .eq("store_id", storeId),
            range.previousStartIso,
            range.previousEndExclusiveIso
          ),
          shopifyConnected
        )
      : Promise.resolve(emptyCount),
    scopeOrdersQuery(
      withCreatedAtRange(
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("store_id", storeId)
          .eq("status", "confirmed"),
        range.currentStartIso,
        range.currentEndExclusiveIso
      ),
      shopifyConnected
    ),
    range.previousStartIso
      ? scopeOrdersQuery(
          withCreatedAtRange(
            supabase
              .from("orders")
              .select("*", { count: "exact", head: true })
              .eq("store_id", storeId)
              .eq("status", "confirmed"),
            range.previousStartIso,
            range.previousEndExclusiveIso
          ),
          shopifyConnected
        )
      : Promise.resolve(emptyCount),
    scopeOrdersQuery(
      withCreatedAtRange(
        supabase
          .from("orders")
          .select("total, currency")
          .eq("store_id", storeId)
          .eq("status", "confirmed"),
        range.currentStartIso,
        range.currentEndExclusiveIso
      ),
      shopifyConnected
    ),
    range.previousStartIso
      ? scopeOrdersQuery(
          withCreatedAtRange(
            supabase
              .from("orders")
              .select("total, currency")
              .eq("store_id", storeId)
              .eq("status", "confirmed"),
            range.previousStartIso,
            range.previousEndExclusiveIso
          ),
          shopifyConnected
        )
      : Promise.resolve({ data: [], error: null }),
    withCreatedAtRange(
      supabase
        .from("whatsapp_conversations")
        .select("created_at")
        .eq("store_id", storeId)
        .limit(5000),
      range.currentStartIso,
      range.currentEndExclusiveIso
    ),
    scopeOrdersQuery(
      withCreatedAtRange(
        supabase
          .from("orders")
          .select("created_at")
          .eq("store_id", storeId)
          .limit(5000),
        range.currentStartIso,
        range.currentEndExclusiveIso
      ),
      shopifyConnected
    ),
    scopeOrdersQuery(
      supabase
        .from("orders")
        .select("items, total, currency, status")
        .eq("store_id", storeId)
        .in("status", ["confirmed", "pending"])
        .order("created_at", { ascending: false })
        .limit(200),
      shopifyConnected
    ),
  ]);

  const aiConfigured = Boolean(
    store?.ai_agent_name?.trim() ||
      store?.ai_opening_message?.trim() ||
      (store?.ai_order_template_id &&
        store.ai_order_template_id !== DEFAULT_ORDER_TEMPLATE_ID)
  );

  const hasChat = (chatExistsRes.count ?? 0) > 0;
  const hasProduct = productCount > 0 || adRows.length > 0;

  const setupSteps: DashboardSetupStep[] = [
    {
      id: "account",
      label: "Account Created",
      description: "Your reseller account is ready",
      done: true,
      href: "/dashboard",
    },
    {
      id: "business",
      label: "Business Information",
      description: "Set your store name in Shopify settings",
      done: businessInfoDone,
      href: "/dashboard/integrations/shopify",
    },
    {
      id: "whatsapp",
      label: "WhatsApp Number Connected",
      description: "Enable AI chat and order confirmations",
      done: whatsappConnected,
      href: "/dashboard/integrations/whatsapp",
    },
    {
      id: "meta",
      label: "Meta App Connected",
      description: "WhatsApp Cloud API credentials saved",
      done: metaConnected,
      href: "/dashboard/integrations/whatsapp",
    },
    {
      id: "product",
      label: "Product Added",
      description: "Add a catalog product or get a Shopify product SKU",
      done: hasProduct,
      href: "/dashboard/products",
    },
    {
      id: "ai",
      label: "AI Training",
      description: "Set agent name, opening message, and templates",
      done: aiConfigured,
      href: "/dashboard/ai",
    },
    {
      id: "first_chat",
      label: "First Customer Chat",
      description: "A customer messages on WhatsApp",
      done: hasChat,
      href: "/dashboard/inbox",
    },
  ];

  const doneCount = setupSteps.filter((s) => s.done).length;
  const percentComplete = Math.round((doneCount / setupSteps.length) * 100);

  const recentOrders: DashboardRecentOrder[] = (recentOrdersRes.data ?? []).map(
    (o) => {
      const customer = o.customers as
        | { name: string | null }
        | { name: string | null }[]
        | null;
      const name = Array.isArray(customer)
        ? customer[0]?.name
        : customer?.name;
      return {
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        total: o.total,
        currency: o.currency,
        created_at: o.created_at,
        customer_name: name ?? null,
      };
    }
  );

  const chatIds = (recentChatsRes.data ?? []).map((c) => c.id);
  const lastMessages = new Map<string, string>();

  if (chatIds.length > 0) {
    const msgResults = await Promise.all(
      chatIds.map((convId) =>
        supabase
          .from("whatsapp_messages")
          .select("conversation_id, content")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      )
    );
    for (const { data: msg } of msgResults) {
      if (msg?.conversation_id && msg?.content) {
        lastMessages.set(msg.conversation_id, msg.content);
      }
    }
  }

  const recentChats: DashboardRecentChat[] = (recentChatsRes.data ?? []).map(
    (c) => ({
      id: c.id,
      customer_phone: c.customer_phone,
      status: c.status,
      updated_at: c.updated_at,
      last_message: lastMessages.get(c.id) ?? null,
    })
  );

  const totalClicks = adRows.reduce(
    (sum, row) => sum + ((row.click_count as number) ?? 0),
    0
  );

  const convCurrent = convCurrentRes.count ?? 0;
  const convPrevious = convPreviousRes.count ?? 0;
  const ordersCurrent = ordersCurrentRes.count ?? 0;
  const ordersPrevious = ordersPreviousRes.count ?? 0;
  const confirmedCurrent = confirmedCurrentRes.count ?? 0;
  const confirmedPrevious = confirmedPreviousRes.count ?? 0;

  // Only sum orders in the store's actual currency — mixing currencies in one
  // total produces a meaningless number, so a stray mismatched row (legacy
  // data) is excluded rather than silently added in as if it were the same unit.
  const sumRevenue = (
    rows: Array<{ total: number | null; currency: string | null }> | null
  ) =>
    (rows ?? [])
      .filter((row) => !row.currency || row.currency === effectiveCurrency)
      .reduce((sum, row) => sum + Number(row.total ?? 0), 0);

  const revenueCurrent = sumRevenue(revenueCurrentRes.data);
  const revenuePrevious = sumRevenue(revenuePreviousRes.data);

  const currencyGuess = effectiveCurrency;

  const conversionCurrent =
    convCurrent > 0 ? (ordersCurrent / convCurrent) * 100 : 0;
  const conversionPrevious =
    convPrevious > 0 ? (ordersPrevious / convPrevious) * 100 : 0;

  const chart = emptyChartSeries(range);
  const chartIndex = new Map(chart.map((p, i) => [p.date, i]));

  for (const row of chartConvRes.data ?? []) {
    const key = pointKeyFromIso(row.created_at as string, range.chart.grain);
    const idx = chartIndex.get(key);
    if (idx != null) chart[idx].conversations += 1;
  }
  for (const row of chartOrdersRes.data ?? []) {
    const key = pointKeyFromIso(row.created_at as string, range.chart.grain);
    const idx = chartIndex.get(key);
    if (idx != null) chart[idx].orders += 1;
  }

  const productMap = new Map<
    string,
    { title: string; orders: number; quantity: number; revenue: number }
  >();

  for (const order of topOrdersRes.data ?? []) {
    // Skip orders in a different currency than the store's — their totals
    // aren't comparable to the rest and would corrupt the revenue sum.
    if (order.currency && order.currency !== effectiveCurrency) continue;

    const items = (order.items as Array<{
      title?: string;
      quantity?: number;
      price?: number;
    }> | null) ?? [];
    const orderTotal = Number(order.total ?? 0);
    const itemCount = items.reduce((s, i) => s + Number(i.quantity ?? 1), 0) || 1;

    for (const item of items) {
      const title = (item.title || "Unknown product").trim();
      if (!title) continue;
      const qty = Number(item.quantity ?? 1);
      const lineRevenue =
        item.price != null
          ? Number(item.price) * qty
          : (orderTotal * qty) / itemCount;
      const existing = productMap.get(title) ?? {
        title,
        orders: 0,
        quantity: 0,
        revenue: 0,
      };
      existing.orders += 1;
      existing.quantity += qty;
      existing.revenue += lineRevenue;
      productMap.set(title, existing);
    }
  }

  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)
    .slice(0, 5);

  const handledByAi = convAiRes.count ?? 0;
  const humanTakeover = convHandoffRes.count ?? 0;
  const closed = convClosedRes.count ?? 0;
  const aiDenom = handledByAi + humanTakeover + closed;
  const successRate =
    aiDenom > 0
      ? Math.round(((handledByAi + closed) / aiDenom) * 1000) / 10
      : 0;

  let shareLink: null = null;

  const [{ data: portalSkus }, { data: shopifySkus }] = await Promise.all([
    supabase
      .from("store_products")
      .select("sku, name, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("shopify_product_skus")
      .select("sku, product_title, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const recentSkus: DashboardProductSku[] = [
    ...(portalSkus ?? []).map((p) => ({
      sku: p.sku as string,
      title: (p.name as string) || "Product",
      source: "portal" as const,
      createdAt: (p.created_at as string | null) ?? null,
    })),
    ...(shopifySkus ?? []).map((p) => ({
      sku: p.sku as string,
      title: (p.product_title as string) || "Shopify product",
      source: "shopify" as const,
      createdAt: (p.created_at as string | null) ?? null,
    })),
  ]
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 6);

  return {
    range: {
      id: range.id,
      label: range.label,
      compareLabel: range.compareLabel,
    },
    store: {
      name: store?.store_name || store?.shop_domain || "My Store",
      shop_domain: store?.shop_domain ?? null,
      shopify_connected: shopifyConnected,
      whatsapp_connected: whatsappConnected,
      meta_connected: metaConnected,
      currency: currencyGuess,
    },
    setup: {
      percentComplete,
      completedCount: doneCount,
      totalCount: setupSteps.length,
      steps: setupSteps,
    },
    period: {
      conversations: periodMetric(convCurrent, convPrevious),
      ordersCreated: periodMetric(ordersCurrent, ordersPrevious),
      confirmedOrders: periodMetric(confirmedCurrent, confirmedPrevious),
      conversionRate: periodMetric(
        Math.round(conversionCurrent * 10) / 10,
        Math.round(conversionPrevious * 10) / 10
      ),
      revenue: {
        ...periodMetric(revenueCurrent, revenuePrevious),
        currency: currencyGuess,
      },
    },
    chart,
    orderStatus: {
      pending: pendingRes.count ?? 0,
      confirmed: confirmedRes.count ?? 0,
      cancelled: cancelledRes.count ?? 0,
    },
    topProducts,
    recentSkus,
    shareLink,
    orders: {
      pending: pendingRes.count ?? 0,
      confirmed: confirmedRes.count ?? 0,
      cancelled: cancelledRes.count ?? 0,
      total: orderTotals.total,
      synced: orderTotals.synced,
      shopifyTotal: orderTotals.shopify,
      withTracking: trackingRes.count ?? 0,
      recent: recentOrders,
    },
    inbox: {
      total: convTotalRes.count ?? 0,
      ai_handling: handledByAi,
      human_handoff: humanTakeover,
      closed,
      recent: recentChats,
    },
    aiPerformance: {
      successRate,
      handledByAi,
      humanTakeover,
      closed,
    },
    ai: {
      planName: aiUsage.plan.name,
      used: aiUsage.used,
      limit: aiUsage.limit,
      percentUsed: aiUsage.percentUsed,
      limitReached: aiUsage.limitReached,
      platformConfigured: await isLlmProviderConfigured(),
    },
    ads: {
      linkCount: adRows.length,
      totalClicks,
    },
    products: {
      total: productCount,
    },
  };
}
