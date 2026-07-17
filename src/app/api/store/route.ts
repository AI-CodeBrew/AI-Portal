import { NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformMetaPublic } from "@/lib/platform/meta-settings";
import { getStoreProductQuota } from "@/lib/store/plan-access";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const supabase = createAdminClient();

    const [{ data: store }, platform, quota] = await Promise.all([
      supabase
        .from("stores")
        .select(
          `id, store_name, shop_domain, shopify_api_key, shopify_api_secret, shopify_scopes,
           shopify_access_token, meta_app_id, meta_app_secret, meta_config_id, whatsapp_verify_token,
           whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token, whatsapp_display_phone, plan_id, created_at`
        )
        .eq("id", storeId)
        .single(),
      getPlatformMetaPublic(),
      getStoreProductQuota(storeId),
    ]);

    if (!store) {
      return NextResponse.json({ store: null });
    }

    return NextResponse.json({
      store: {
        id: store.id,
        store_name: store.store_name,
        shop_domain: store.shop_domain,
        shopify_api_key: store.shopify_api_key,
        shopify_scopes: store.shopify_scopes,
        has_shopify_credentials: Boolean(
          store.shopify_api_key && store.shopify_api_secret
        ),
        shopify_connected: Boolean(store.shopify_access_token),
        meta_app_id: store.meta_app_id,
        meta_config_id: store.meta_config_id,
        // Platform Meta app is configured by admin — reseller no longer BYO Meta app
        has_whatsapp_credentials: platform.configured,
        platform_whatsapp_ready: platform.configured,
        whatsapp_verify_token: store.whatsapp_verify_token,
        whatsapp_phone_number_id: store.whatsapp_phone_number_id,
        whatsapp_waba_id: store.whatsapp_waba_id,
        whatsapp_display_phone:
          (store as { whatsapp_display_phone?: string | null })
            .whatsapp_display_phone ?? null,
        whatsapp_connected: Boolean(
          store.whatsapp_phone_number_id && store.whatsapp_access_token
        ),
        plan_id: store.plan_id ?? "basic",
        plan: {
          id: quota.planId,
          name: quota.planName,
          productCount: quota.productCount,
          productLimit: quota.productLimit,
          canAddProduct: quota.canAddProduct,
          shopifyAllowed: quota.shopifyAllowed,
          adminChatAllowed: quota.adminChatAllowed,
        },
        created_at: store.created_at,
      },
    });
  } catch {
    return NextResponse.json({ store: null }, { status: 401 });
  }
}
