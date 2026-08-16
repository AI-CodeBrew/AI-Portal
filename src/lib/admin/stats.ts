import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminResellers } from "@/lib/admin/resellers";
import { getAdminRecentOrders } from "@/lib/admin/orders";

export interface AdminPeriodMetric {
  current: number;
  previous: number;
  deltaPercent: number | null;
}

export interface AdminDayPoint {
  date: string;
  label: string;
  conversations: number;
  orders: number;
}

export interface AdminPlatformStats {
  resellers: number;
  orders: { total: number; pending: number; confirmed: number; cancelled: number };
  chats: {
    total: number;
    handoff: number;
    aiHandling: number;
    closed: number;
  };
  integrations: { shopify: number; whatsapp: number; meta: number };
  aiLimitReached: number;
  adLinks: number;
  products: number;
  period: {
    conversations: AdminPeriodMetric;
    ordersCreated: AdminPeriodMetric;
    confirmedOrders: AdminPeriodMetric;
    conversionRate: AdminPeriodMetric;
    revenue: AdminPeriodMetric & { currency: string };
  };
  /** Full breakdown when orders span more than one currency — the single
   * `period.revenue` figure above only covers the largest currency group. */
  revenueByCurrency: Array<{
    currency: string;
    current: number;
    previous: number;
  }>;
  chart: AdminDayPoint[];
  aiPerformance: {
    successRate: number;
    handledByAi: number;
    humanTakeover: number;
  };
  recentResellers: Array<{
    id: string;
    name: string;
    email: string;
    storeName: string | null;
    plan: string;
    aiUsed: number;
    aiLimit: number;
    joined: string;
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string | null;
    storeName: string | null;
    status: string;
    total: number | null;
    currency: string | null;
    createdAt: string;
  }>;
  recentChats: Array<{
    id: string;
    phone: string;
    storeName: string | null;
    status: string;
    updatedAt: string;
  }>;
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

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function dayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function periodMetric(current: number, previous: number): AdminPeriodMetric {
  return {
    current,
    previous,
    deltaPercent: deltaPercent(current, previous),
  };
}

function emptyDaySeries(from: Date, days: number): AdminDayPoint[] {
  const points: AdminDayPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    points.push({
      date: key,
      label: dayLabel(key),
      conversations: 0,
      orders: 0,
    });
  }
  return points;
}

export async function getAdminPlatformStats(): Promise<AdminPlatformStats> {
  const supabase = createAdminClient();
  const { resellers } = await getAdminResellers();
  const recentOrdersData = await getAdminRecentOrders(5);

  const currentStart = daysAgo(6);
  const previousStart = daysAgo(13);
  const previousEnd = daysAgo(7);
  const currentStartIso = currentStart.toISOString();
  const previousStartIso = previousStart.toISOString();
  const previousEndIso = previousEnd.toISOString();

  const [
    orderTotalRes,
    pendingRes,
    confirmedRes,
    cancelledRes,
    chatTotalRes,
    handoffRes,
    aiHandlingRes,
    closedRes,
    shopifyRes,
    whatsappRes,
    metaRes,
    adLinksRes,
    productsRes,
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
    recentChatsRes,
  ] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "confirmed"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "cancelled"),
    supabase
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "human_handoff"),
    supabase
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "ai_handling"),
    supabase
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "closed"),
    supabase
      .from("stores")
      .select("*", { count: "exact", head: true })
      .not("shopify_access_token", "is", null),
    supabase
      .from("stores")
      .select("*", { count: "exact", head: true })
      .not("whatsapp_phone_number_id", "is", null),
    supabase
      .from("stores")
      .select("*", { count: "exact", head: true })
      .not("meta_app_id", "is", null),
    supabase.from("ad_whatsapp_links").select("id", { count: "exact", head: true }),
    supabase.from("store_products").select("id", { count: "exact", head: true }),
    supabase
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true })
      .gte("created_at", currentStartIso),
    supabase
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true })
      .gte("created_at", previousStartIso)
      .lt("created_at", previousEndIso),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .gte("created_at", currentStartIso),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .gte("created_at", previousStartIso)
      .lt("created_at", previousEndIso),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "confirmed")
      .gte("created_at", currentStartIso),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "confirmed")
      .gte("created_at", previousStartIso)
      .lt("created_at", previousEndIso),
    supabase
      .from("orders")
      .select("total, currency")
      .eq("status", "confirmed")
      .gte("created_at", currentStartIso),
    supabase
      .from("orders")
      .select("total, currency")
      .eq("status", "confirmed")
      .gte("created_at", previousStartIso)
      .lt("created_at", previousEndIso),
    supabase
      .from("whatsapp_conversations")
      .select("created_at")
      .gte("created_at", currentStartIso),
    supabase
      .from("orders")
      .select("created_at")
      .gte("created_at", currentStartIso),
    supabase
      .from("whatsapp_conversations")
      .select("id, customer_phone, status, updated_at, store_id, stores(store_name, shop_domain)")
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  const aiLimitReached = resellers.filter((r) => r.aiUsage?.limitReached).length;

  const resellerOrderTotal = resellers.reduce((sum, r) => sum + r.orderCount, 0);
  const syncedOrderTotal = orderTotalRes.count ?? 0;
  const platformOrderTotal = Math.max(resellerOrderTotal, syncedOrderTotal);

  const recentResellers = resellers.slice(0, 5).map((r) => ({
    id: r.id,
    name: r.full_name || r.email,
    email: r.email,
    storeName: r.store?.store_name ?? null,
    plan: r.store?.plan_id ?? "basic",
    aiUsed: r.aiUsage?.used ?? 0,
    aiLimit: r.aiUsage?.limit ?? 0,
    joined: r.created_at,
  }));

  const recentOrders = recentOrdersData.map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    storeName: o.stores?.store_name ?? o.stores?.shop_domain ?? null,
    status: o.status,
    total: o.total,
    currency: o.currency,
    createdAt: o.created_at,
  }));

  const recentChats = (recentChatsRes.data ?? []).map((c) => {
    const stores = c.stores as
      | { store_name: string | null; shop_domain: string | null }
      | { store_name: string | null; shop_domain: string | null }[]
      | null;
    const store = Array.isArray(stores) ? stores[0] : stores;
    return {
      id: c.id,
      phone: c.customer_phone as string,
      storeName: store?.store_name ?? store?.shop_domain ?? null,
      status: c.status as string,
      updatedAt: c.updated_at as string,
    };
  });

  const convCurrent = convCurrentRes.count ?? 0;
  const convPrevious = convPreviousRes.count ?? 0;
  const ordersCurrent = ordersCurrentRes.count ?? 0;
  const ordersPrevious = ordersPreviousRes.count ?? 0;
  const confirmedCurrent = confirmedCurrentRes.count ?? 0;
  const confirmedPrevious = confirmedPreviousRes.count ?? 0;

  // Platform-wide orders legitimately span multiple stores, each potentially
  // on a different currency — summing raw totals across currencies produces
  // a meaningless number, so revenue is grouped by currency instead of
  // collapsed into one figure with a guessed label.
  type RevenueRow = { total: number | null; currency: string | null };
  const groupRevenueByCurrency = (
    rows: RevenueRow[] | null
  ): Map<string, number> => {
    const byCurrency = new Map<string, number>();
    for (const row of rows ?? []) {
      const code = (row.currency || "UNKNOWN").toUpperCase();
      byCurrency.set(code, (byCurrency.get(code) ?? 0) + Number(row.total ?? 0));
    }
    return byCurrency;
  };

  const currentByCurrency = groupRevenueByCurrency(revenueCurrentRes.data);
  const previousByCurrency = groupRevenueByCurrency(revenuePreviousRes.data);
  const allCurrencies = new Set([
    ...currentByCurrency.keys(),
    ...previousByCurrency.keys(),
  ]);

  const revenueByCurrency = Array.from(allCurrencies)
    .map((currency) => ({
      currency,
      current: currentByCurrency.get(currency) ?? 0,
      previous: previousByCurrency.get(currency) ?? 0,
    }))
    .sort((a, b) => b.current - a.current);

  // Primary card keeps showing one number for the largest currency group —
  // it's exact for that currency (not a cross-currency sum), and
  // revenueByCurrency below carries the rest.
  const primaryRevenue = revenueByCurrency[0] ?? {
    currency: "AED",
    current: 0,
    previous: 0,
  };
  const revenueCurrent = primaryRevenue.current;
  const revenuePrevious = primaryRevenue.previous;
  const currencyGuess = primaryRevenue.currency;

  const conversionCurrent =
    convCurrent > 0 ? (ordersCurrent / convCurrent) * 100 : 0;
  const conversionPrevious =
    convPrevious > 0 ? (ordersPrevious / convPrevious) * 100 : 0;

  const chart = emptyDaySeries(currentStart, 7);
  const chartIndex = new Map(chart.map((p, i) => [p.date, i]));
  for (const row of chartConvRes.data ?? []) {
    const key = toDateKey(row.created_at as string);
    const idx = chartIndex.get(key);
    if (idx != null) chart[idx].conversations += 1;
  }
  for (const row of chartOrdersRes.data ?? []) {
    const key = toDateKey(row.created_at as string);
    const idx = chartIndex.get(key);
    if (idx != null) chart[idx].orders += 1;
  }

  const handledByAi = aiHandlingRes.count ?? 0;
  const humanTakeover = handoffRes.count ?? 0;
  const closed = closedRes.count ?? 0;
  const aiDenom = handledByAi + humanTakeover + closed;
  const successRate =
    aiDenom > 0
      ? Math.round(((handledByAi + closed) / aiDenom) * 1000) / 10
      : 0;

  return {
    resellers: resellers.length,
    orders: {
      total: platformOrderTotal,
      pending: pendingRes.count ?? 0,
      confirmed: confirmedRes.count ?? 0,
      cancelled: cancelledRes.count ?? 0,
    },
    chats: {
      total: chatTotalRes.count ?? 0,
      handoff: humanTakeover,
      aiHandling: handledByAi,
      closed,
    },
    integrations: {
      shopify: shopifyRes.count ?? 0,
      whatsapp: whatsappRes.count ?? 0,
      meta: metaRes.count ?? 0,
    },
    aiLimitReached,
    adLinks: adLinksRes.count ?? 0,
    products: productsRes.error ? 0 : (productsRes.count ?? 0),
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
    revenueByCurrency,
    chart,
    aiPerformance: {
      successRate,
      handledByAi,
      humanTakeover,
    },
    recentResellers,
    recentOrders,
    recentChats,
  };
}
