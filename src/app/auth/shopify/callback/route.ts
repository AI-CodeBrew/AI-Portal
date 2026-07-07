import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { encrypt } from "@/lib/crypto";
import {
  exchangeShopifyToken,
  registerShopifyWebhooks,
  getAppUrl,
  resolveShopifySecret,
} from "@/lib/shopify";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || user.role !== "reseller" || !user.storeId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const shop = searchParams.get("shop");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("shopify_oauth_state")?.value;
  const savedShop = cookieStore.get("shopify_oauth_shop")?.value;
  const savedStoreId = cookieStore.get("shopify_oauth_store_id")?.value;

  if (!code || !state || !shop || state !== savedState) {
    return NextResponse.redirect(
      new URL("/dashboard/integrations/shopify?error=oauth_failed", request.url)
    );
  }

  if (savedStoreId && savedStoreId !== user.storeId) {
    return NextResponse.redirect(
      new URL("/dashboard/integrations/shopify?error=oauth_mismatch", request.url)
    );
  }

  const shopDomain = savedShop || shop;
  const supabase = createAdminClient();

  const { data: store } = await supabase
    .from("stores")
    .select("shopify_api_key, shopify_api_secret, shopify_scopes")
    .eq("id", user.storeId)
    .single();

  const apiSecret = resolveShopifySecret(store?.shopify_api_secret ?? null);
  if (!store?.shopify_api_key || !apiSecret) {
    return NextResponse.redirect(
      new URL("/dashboard/integrations/shopify?error=missing_credentials", request.url)
    );
  }

  try {
    const accessToken = await exchangeShopifyToken(shopDomain, code, {
      apiKey: store.shopify_api_key,
      apiSecret,
      scopes: store.shopify_scopes ?? undefined,
    });
    const encryptedToken = encrypt(accessToken);

    const { data: existingStore } = await supabase
      .from("stores")
      .select("id")
      .eq("shop_domain", shopDomain)
      .neq("id", user.storeId)
      .maybeSingle();

    if (existingStore) {
      return NextResponse.redirect(
        new URL("/dashboard/integrations/shopify?error=shop_taken", request.url)
      );
    }

    const { error } = await supabase
      .from("stores")
      .update({
        shop_domain: shopDomain,
        shopify_access_token: encryptedToken,
        owner_id: user.id,
      })
      .eq("id", user.storeId);

    if (error) {
      throw new Error(error.message);
    }

    const appUrl = getAppUrl(request.url);
    await registerShopifyWebhooks(shopDomain, encryptedToken, appUrl);

    cookieStore.delete("shopify_oauth_state");
    cookieStore.delete("shopify_oauth_shop");
    cookieStore.delete("shopify_oauth_store_id");

    return NextResponse.redirect(
      new URL("/dashboard/integrations/shopify?connected=shopify", request.url)
    );
  } catch (err) {
    console.error("Shopify OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/dashboard/integrations/shopify?error=oauth_callback", request.url)
    );
  }
}
