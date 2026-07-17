import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPlan,
  normalizePlanId,
  planAllowsShopify,
  type PlanId,
} from "@/lib/ai/plans";
import { countStoreProducts } from "@/lib/products/products-service";

export async function getStorePlanId(storeId: string): Promise<PlanId> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("stores")
    .select("plan_id")
    .eq("id", storeId)
    .maybeSingle();
  return normalizePlanId(data?.plan_id as string | null);
}

export async function assertShopifyPlanAllowed(
  storeId: string
): Promise<{ ok: true; planId: PlanId } | { ok: false; error: string }> {
  const planId = await getStorePlanId(storeId);
  if (!planAllowsShopify(planId)) {
    const plan = getPlan(planId);
    return {
      ok: false,
      error: `Shopify integration requires Growth plan or higher. You're on ${plan.name} — upgrade under Plan & Usage.`,
    };
  }
  return { ok: true, planId };
}

export async function getStoreProductQuota(storeId: string): Promise<{
  planId: PlanId;
  planName: string;
  productCount: number;
  productLimit: number | null;
  canAddProduct: boolean;
  shopifyAllowed: boolean;
  adminChatAllowed: boolean;
}> {
  const planId = await getStorePlanId(storeId);
  const plan = getPlan(planId);
  const productCount = await countStoreProducts(storeId);
  const productLimit = plan.productLimit;
  const canAddProduct =
    productLimit == null ? true : productCount < productLimit;

  return {
    planId,
    planName: plan.name,
    productCount,
    productLimit,
    canAddProduct,
    shopifyAllowed: plan.shopifyIntegration,
    adminChatAllowed: plan.adminChat,
  };
}
