import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminResellers } from "@/lib/admin/resellers";
import { getAdminRecentOrders } from "@/lib/admin/orders";

export interface AdminPlatformStats {
  resellers: number;
  orders: { total: number; pending: number; confirmed: number };
  chats: { total: number; handoff: number };
  integrations: { shopify: number; whatsapp: number };
  aiLimitReached: number;
  adLinks: number;
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
}

export async function getAdminPlatformStats(): Promise<AdminPlatformStats> {
  const supabase = createAdminClient();
  const { resellers } = await getAdminResellers();
  const recentOrdersData = await getAdminRecentOrders(5);

  const [
    orderTotalRes,
    pendingRes,
    confirmedRes,
    chatTotalRes,
    handoffRes,
    shopifyRes,
    whatsappRes,
    adLinksRes,
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
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "human_handoff"),
    supabase
      .from("stores")
      .select("*", { count: "exact", head: true })
      .not("shopify_access_token", "is", null),
    supabase
      .from("stores")
      .select("*", { count: "exact", head: true })
      .not("whatsapp_phone_number_id", "is", null),
    supabase.from("ad_whatsapp_links").select("id", { count: "exact", head: true }),
  ]);

  const aiLimitReached = resellers.filter((r) => r.aiUsage?.limitReached).length;

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

  return {
    resellers: resellers.length,
    orders: {
      total: orderTotalRes.count ?? 0,
      pending: pendingRes.count ?? 0,
      confirmed: confirmedRes.count ?? 0,
    },
    chats: {
      total: chatTotalRes.count ?? 0,
      handoff: handoffRes.count ?? 0,
    },
    integrations: {
      shopify: shopifyRes.count ?? 0,
      whatsapp: whatsappRes.count ?? 0,
    },
    aiLimitReached,
    adLinks: adLinksRes.count ?? 0,
    recentResellers,
    recentOrders,
  };
}
