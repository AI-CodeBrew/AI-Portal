import { createAdminClient } from "@/lib/supabase/admin";
import { getBulkStoreAiUsage, type StoreAiUsage } from "@/lib/ai/quota";
import type { PlanId } from "@/lib/ai/plans";
import { getBulkStoreOrderTotals } from "@/lib/orders/store-order-totals";
import { countStoreProducts } from "@/lib/products/products-service";

export type AdminResellerRow = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  store_id: string | null;
  store: {
    id: string;
    store_name: string | null;
    shop_domain: string | null;
    shopify_access_token: string | null;
    whatsapp_phone_number_id: string | null;
    owner_email: string | null;
    plan_id: PlanId;
    ai_agent_name: string | null;
    created_at: string;
  } | null;
  /** Best-known total (Shopify store count + WhatsApp-only when available) */
  orderCount: number;
  /** Rows currently synced into the portal DB */
  syncedOrderCount: number;
  shopifyOrderCount: number | null;
  chatCount: number;
  pendingOrderCount: number;
  adLinkCount: number;
  productCount: number;
  aiUsage: StoreAiUsage | null;
};

type StoreRow = AdminResellerRow["store"] & { owner_id: string | null };

export async function getAdminResellers(): Promise<{
  resellers: AdminResellerRow[];
  error: string | null;
}> {
  const supabase = createAdminClient();

  const { data: portalResellers, error: usersError } = await supabase
    .from("portal_users")
    .select("id, email, full_name, created_at, store_id")
    .eq("role", "reseller")
    .order("created_at", { ascending: false });

  if (usersError) {
    console.error("[admin/resellers] portal_users:", usersError.message);
    return { resellers: [], error: usersError.message };
  }

  let rows = portalResellers ?? [];

  // Fallback: list from Supabase Auth if portal_users is empty (trigger/profile gap)
  if (rows.length === 0) {
    const { data: authData, error: authError } =
      await supabase.auth.admin.listUsers({ perPage: 1000 });

    if (authError) {
      console.error("[admin/resellers] auth.users:", authError.message);
    } else {
      const { data: allStores } = await supabase
        .from("stores")
        .select("id, owner_id")
        .not("owner_id", "is", null);

      const storeByOwner = new Map(
        (allStores ?? []).map((s) => [s.owner_id as string, s.id as string])
      );

      rows = (authData?.users ?? [])
        .filter((u) => u.user_metadata?.role !== "admin")
        .map((u) => ({
          id: u.id,
          email: u.email ?? "",
          full_name:
            (u.user_metadata?.full_name as string | undefined) ??
            (u.user_metadata?.fullName as string | undefined) ??
            null,
          created_at: u.created_at,
          store_id: storeByOwner.get(u.id) ?? null,
        }));
    }
  }

  if (rows.length === 0) {
    return { resellers: [], error: null };
  }

  const storeIds = [
    ...new Set(rows.map((r) => r.store_id).filter(Boolean)),
  ] as string[];
  const ownerIds = rows.map((r) => r.id);

  const storeSelect =
    "id, store_name, shop_domain, shopify_access_token, whatsapp_phone_number_id, whatsapp_waba_id, owner_email, owner_id, plan_id, ai_agent_name, created_at";

  const [byIdRes, byOwnerRes] = await Promise.all([
    storeIds.length > 0
      ? supabase.from("stores").select(storeSelect).in("id", storeIds)
      : Promise.resolve({ data: [] as StoreRow[], error: null }),
    supabase.from("stores").select(storeSelect).in("owner_id", ownerIds),
  ]);

  const storesById = new Map<string, StoreRow>();
  const storesByOwner = new Map<string, StoreRow>();

  for (const store of [...(byIdRes.data ?? []), ...(byOwnerRes.data ?? [])]) {
    storesById.set(store.id, store as StoreRow);
    if (store.owner_id) {
      storesByOwner.set(store.owner_id, store as StoreRow);
    }
  }

  const enriched = await Promise.all(
    rows.map(async (row) => {
      const store =
        (row.store_id ? storesById.get(row.store_id) : null) ??
        storesByOwner.get(row.id) ??
        null;

      const storeId = store?.id ?? row.store_id;

      const [{ count: chatCount }, { count: pendingOrderCount }] = storeId
        ? await Promise.all([
            supabase
              .from("whatsapp_conversations")
              .select("*", { count: "exact", head: true })
              .eq("store_id", storeId),
            supabase
              .from("orders")
              .select("*", { count: "exact", head: true })
              .eq("store_id", storeId)
              .eq("status", "pending"),
          ])
        : [{ count: 0 }, { count: 0 }];

      let adLinkCount = 0;
      let productCount = 0;
      if (storeId) {
        const [adRes, products] = await Promise.all([
          supabase
            .from("ad_whatsapp_links")
            .select("*", { count: "exact", head: true })
            .eq("store_id", storeId),
          countStoreProducts(storeId),
        ]);
        if (!adRes.error) adLinkCount = adRes.count ?? 0;
        productCount = products;
      }

      return {
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        created_at: row.created_at,
        store_id: storeId,
        store: store
          ? {
              id: store.id,
              store_name: store.store_name,
              shop_domain: store.shop_domain,
              shopify_access_token: store.shopify_access_token,
              whatsapp_phone_number_id: store.whatsapp_phone_number_id,
              owner_email: store.owner_email,
              plan_id: (store.plan_id ?? "basic") as PlanId,
              ai_agent_name: store.ai_agent_name ?? null,
              created_at: store.created_at,
            }
          : null,
        orderCount: 0,
        syncedOrderCount: 0,
        shopifyOrderCount: null as number | null,
        chatCount: chatCount ?? 0,
        pendingOrderCount: pendingOrderCount ?? 0,
        adLinkCount,
        productCount,
        aiUsage: null as StoreAiUsage | null,
      };
    })
  );

  const storesForTotals = enriched
    .filter((r) => r.store_id && r.store)
    .map((r) => ({
      id: r.store_id!,
      shop_domain: r.store!.shop_domain,
      shopify_access_token: r.store!.shopify_access_token,
    }));

  const [usageMap, orderTotalsMap] = await Promise.all([
    getBulkStoreAiUsage(
      enriched.map((r) => r.store_id).filter(Boolean) as string[]
    ),
    getBulkStoreOrderTotals(storesForTotals),
  ]);

  return {
    resellers: enriched.map((r) => {
      const totals = r.store_id ? orderTotalsMap.get(r.store_id) : undefined;
      return {
        ...r,
        orderCount: totals?.total ?? 0,
        syncedOrderCount: totals?.synced ?? 0,
        shopifyOrderCount: totals?.shopify ?? null,
        aiUsage: r.store_id ? (usageMap.get(r.store_id) ?? null) : null,
      };
    }),
    error: null,
  };
}
