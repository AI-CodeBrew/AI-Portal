import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreAiUsage } from "@/lib/ai/quota";
import { DEFAULT_ORDER_TEMPLATE_ID } from "@/lib/ai/ai-settings-types";
import { isSalesAgentConfigured } from "@/lib/ai/run-sales-agent";

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

export interface ResellerDashboardStats {
  store: {
    name: string;
    shop_domain: string | null;
    shopify_connected: boolean;
    whatsapp_connected: boolean;
  };
  setup: {
    percentComplete: number;
    steps: DashboardSetupStep[];
  };
  orders: {
    pending: number;
    confirmed: number;
    cancelled: number;
    total: number;
    withTracking: number;
    recent: DashboardRecentOrder[];
  };
  inbox: {
    total: number;
    ai_handling: number;
    human_handoff: number;
    recent: DashboardRecentChat[];
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
}

export async function getResellerDashboardStats(
  storeId: string
): Promise<ResellerDashboardStats> {
  const supabase = createAdminClient();

  const { data: store } = await supabase
    .from("stores")
    .select(
      "store_name, shop_domain, shopify_access_token, whatsapp_phone_number_id, whatsapp_access_token, ai_agent_name, ai_opening_message, ai_order_template_id"
    )
    .eq("id", storeId)
    .single();

  const shopifyConnected = Boolean(store?.shopify_access_token);
  const whatsappConnected = Boolean(
    store?.whatsapp_phone_number_id && store?.whatsapp_access_token
  );

  const adLinksQuery = await supabase
    .from("ad_whatsapp_links")
    .select("click_count")
    .eq("store_id", storeId);

  const adRows =
    adLinksQuery.error?.message.includes("ad_whatsapp_links") ||
    adLinksQuery.error?.code === "42P01"
      ? []
      : (adLinksQuery.data ?? []);

  const [
    pendingRes,
    confirmedRes,
    cancelledRes,
    totalRes,
    trackingRes,
    convTotalRes,
    convAiRes,
    convHandoffRes,
    orderExistsRes,
    chatExistsRes,
    recentOrdersRes,
    recentChatsRes,
    aiUsage,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "pending"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "confirmed"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "cancelled"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .not("tracking_number", "is", null),
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
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .limit(1),
    supabase
      .from("whatsapp_conversations")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .limit(1),
    supabase
      .from("orders")
      .select("id, order_number, status, total, currency, created_at, customers(name)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("whatsapp_conversations")
      .select("id, customer_phone, status, updated_at")
      .eq("store_id", storeId)
      .order("updated_at", { ascending: false })
      .limit(5),
    getStoreAiUsage(storeId),
  ]);

  const aiConfigured = Boolean(
    store?.ai_agent_name?.trim() ||
      store?.ai_opening_message?.trim() ||
      (store?.ai_order_template_id &&
        store.ai_order_template_id !== DEFAULT_ORDER_TEMPLATE_ID)
  );

  const hasOrder = (orderExistsRes.count ?? 0) > 0;
  const hasChat = (chatExistsRes.count ?? 0) > 0;

  const setupSteps: DashboardSetupStep[] = [
    {
      id: "shopify",
      label: "Connect Shopify",
      description: "Sync products and orders from your store",
      done: shopifyConnected,
      href: "/dashboard/integrations/shopify",
    },
    {
      id: "whatsapp",
      label: "Connect WhatsApp",
      description: "Enable AI chat and order confirmations",
      done: whatsappConnected,
      href: "/dashboard/integrations/whatsapp",
    },
    {
      id: "ai",
      label: "Configure AI agent",
      description: "Set name, opening message, and templates",
      done: aiConfigured,
      href: "/dashboard/ai",
    },
    {
      id: "first_order",
      label: "Receive your first order",
      description: "From WhatsApp AI or Shopify sync",
      done: hasOrder,
      href: "/dashboard/orders",
    },
    {
      id: "first_chat",
      label: "Handle your first chat",
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
    for (const convId of chatIds) {
      const { data: msg } = await supabase
        .from("whatsapp_messages")
        .select("content")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (msg?.content) lastMessages.set(convId, msg.content);
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

  return {
    store: {
      name: store?.store_name || store?.shop_domain || "My Store",
      shop_domain: store?.shop_domain ?? null,
      shopify_connected: shopifyConnected,
      whatsapp_connected: whatsappConnected,
    },
    setup: {
      percentComplete,
      steps: setupSteps,
    },
    orders: {
      pending: pendingRes.count ?? 0,
      confirmed: confirmedRes.count ?? 0,
      cancelled: cancelledRes.count ?? 0,
      total: totalRes.count ?? 0,
      withTracking: trackingRes.count ?? 0,
      recent: recentOrders,
    },
    inbox: {
      total: convTotalRes.count ?? 0,
      ai_handling: convAiRes.count ?? 0,
      human_handoff: convHandoffRes.count ?? 0,
      recent: recentChats,
    },
    ai: {
      planName: aiUsage.plan.name,
      used: aiUsage.used,
      limit: aiUsage.limit,
      percentUsed: aiUsage.percentUsed,
      limitReached: aiUsage.limitReached,
      platformConfigured: isSalesAgentConfigured(),
    },
    ads: {
      linkCount: adRows.length,
      totalClicks,
    },
  };
}
