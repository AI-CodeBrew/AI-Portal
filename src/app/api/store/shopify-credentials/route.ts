import { NextRequest, NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_SHOPIFY_SCOPES } from "@/lib/shopify";

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      storeName?: string;
      shopDomain?: string;
      apiKey?: string;
      apiSecret?: string;
      scopes?: string;
    };

    const { storeName, shopDomain, apiKey, apiSecret, scopes } = body;

    if (!shopDomain?.trim() || !apiKey?.trim()) {
      return NextResponse.json(
        { error: "Shop domain and API key are required" },
        { status: 400 }
      );
    }

    const normalizedShop = shopDomain.includes(".myshopify.com")
      ? shopDomain.trim()
      : `${shopDomain.trim()}.myshopify.com`;

    const supabase = createAdminClient();

    const { data: current } = await supabase
      .from("stores")
      .select("shopify_api_secret")
      .eq("id", storeId)
      .single();

    if (!apiSecret?.trim() && !current?.shopify_api_secret) {
      return NextResponse.json(
        { error: "API secret is required for first-time setup" },
        { status: 400 }
      );
    }

    const { data: taken } = await supabase
      .from("stores")
      .select("id")
      .eq("shop_domain", normalizedShop)
      .neq("id", storeId)
      .maybeSingle();

    if (taken) {
      return NextResponse.json(
        { error: "This shop domain is already connected to another account" },
        { status: 400 }
      );
    }

    const updatePayload: Record<string, string | null> = {
      store_name: storeName?.trim() || null,
      shop_domain: normalizedShop,
      shopify_api_key: apiKey.trim(),
      shopify_scopes: scopes?.trim() || DEFAULT_SHOPIFY_SCOPES,
    };

    if (apiSecret?.trim()) {
      updatePayload.shopify_api_secret = encrypt(apiSecret.trim());
    }

    const { error } = await supabase
      .from("stores")
      .update(updatePayload)
      .eq("id", storeId);

    if (error) {
      const hint =
        error.message.includes("shopify_api_key") ||
        error.message.includes("column")
          ? " — Run migration 003_shopify_per_store.sql in Supabase SQL Editor"
          : "";
      return NextResponse.json(
        { error: error.message + hint },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, shopDomain: normalizedShop });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
