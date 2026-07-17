import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import {
  getShopifyAuthUrl,
  getAppUrl,
  resolveShopifySecret,
} from "@/lib/shopify";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertShopifyPlanAllowed } from "@/lib/store/plan-access";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || user.role !== "reseller" || !user.storeId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const planCheck = await assertShopifyPlanAllowed(user.storeId);
  if (!planCheck.ok) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/integrations/shopify?error=plan_required`,
        request.url
      )
    );
  }

  const supabase = createAdminClient();
  const { data: store } = await supabase
    .from("stores")
    .select("shop_domain, shopify_api_key, shopify_api_secret, shopify_scopes")
    .eq("id", user.storeId)
    .single();

  if (!store?.shopify_api_key || !store.shopify_api_secret) {
    return NextResponse.redirect(
      new URL("/dashboard/integrations/shopify?error=missing_credentials", request.url)
    );
  }

  const shopDomain = store.shop_domain;
  if (!shopDomain) {
    return NextResponse.redirect(
      new URL("/dashboard/integrations/shopify?error=missing_shop", request.url)
    );
  }

  const apiSecret = resolveShopifySecret(store.shopify_api_secret);
  if (!apiSecret) {
    return NextResponse.redirect(
      new URL("/dashboard/integrations/shopify?error=invalid_credentials", request.url)
    );
  }

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  cookieStore.set("shopify_oauth_shop", shopDomain, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  cookieStore.set("shopify_oauth_store_id", user.storeId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const appUrl = getAppUrl(request.url);
  const authUrl = getShopifyAuthUrl(
    shopDomain,
    state,
    {
      apiKey: store.shopify_api_key,
      apiSecret,
      scopes: store.shopify_scopes ?? undefined,
    },
    appUrl
  );

  return NextResponse.redirect(authUrl);
}
