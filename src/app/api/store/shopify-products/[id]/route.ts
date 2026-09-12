import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedShopifyProduct } from "@/lib/shopify/cached-catalog";
import { getStoreWithIntegrations } from "@/lib/ads/ad-links-service";
import {
  getStoreWhatsAppCredentials,
  getWhatsAppDisplayPhone,
} from "@/lib/whatsapp";
import { buildWhatsAppAdUrl } from "@/lib/ads/whatsapp-ad-links";
import type { AdWhatsAppLink } from "@/lib/ads/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { storeId } = await requireResellerStore();
    const { id } = await params;
    const productId = Number(id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
    }

    const cached = await getCachedShopifyProduct(storeId, productId);
    if (!cached) {
      return NextResponse.json(
        { error: "Product not found. Sync Shopify products first." },
        { status: 404 }
      );
    }

    const store = await getStoreWithIntegrations(storeId);
    const waCreds = store ? getStoreWhatsAppCredentials(store) : null;
    let existingLink: AdWhatsAppLink | null = null;

    const supabase = createAdminClient();
    const { data: linkRow } = await supabase
      .from("ad_whatsapp_links")
      .select("*")
      .eq("store_id", storeId)
      .eq("shopify_product_id", String(productId))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (linkRow) {
      existingLink = linkRow as AdWhatsAppLink;
      if (waCreds?.phoneNumberId) {
        const displayPhone = await getWhatsAppDisplayPhone(
          waCreds.phoneNumberId,
          waCreds.accessToken
        );
        if (displayPhone) {
          existingLink = {
            ...existingLink,
            whatsapp_url: buildWhatsAppAdUrl(
              displayPhone,
              existingLink.prefill_message
            ),
          };
        }
      }
    }

    return NextResponse.json({
      product: cached.product,
      currency: cached.currency,
      whatsappConnected: Boolean(waCreds?.phoneNumberId),
      existingLink,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
