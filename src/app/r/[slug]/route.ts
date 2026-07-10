import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdLinkClick } from "@/lib/ads/ad-links-service";
import { buildWhatsAppAdUrl } from "@/lib/ads/whatsapp-ad-links";
import {
  getStoreWhatsAppCredentials,
  getWhatsAppDisplayPhone,
} from "@/lib/whatsapp";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const normalized = slug?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!normalized) {
    return NextResponse.redirect(new URL("/", _request.url));
  }

  const supabase = createAdminClient();

  let link =
    (
      await supabase
        .from("ad_whatsapp_links")
        .select(
          "id, store_id, slug, product_sku, prefill_message, product_title"
        )
        .eq("slug", normalized)
        .limit(1)
        .maybeSingle()
    ).data ?? null;

  if (!link) {
    link =
      (
        await supabase
          .from("ad_whatsapp_links")
          .select(
            "id, store_id, slug, product_sku, prefill_message, product_title"
          )
          .eq("product_sku", normalized)
          .limit(1)
          .maybeSingle()
      ).data ?? null;
  }

  if (!link) {
    return new NextResponse(
      `<!doctype html><html><body style="font-family:system-ui;padding:2rem;text-align:center">
        <h1>Link not found</h1>
        <p>This product link is invalid or has been removed.</p>
      </body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  await recordAdLinkClick(link.id);

  const { data: store } = await supabase
    .from("stores")
    .select("whatsapp_phone_number_id, whatsapp_access_token")
    .eq("id", link.store_id)
    .maybeSingle();

  const waCreds = store
    ? getStoreWhatsAppCredentials({
        whatsapp_phone_number_id: store.whatsapp_phone_number_id,
        whatsapp_access_token: store.whatsapp_access_token,
      })
    : null;

  if (waCreds?.phoneNumberId && waCreds.accessToken && link.prefill_message) {
    const displayPhone = await getWhatsAppDisplayPhone(
      waCreds.phoneNumberId,
      waCreds.accessToken
    );
    if (displayPhone) {
      const waUrl = buildWhatsAppAdUrl(displayPhone, link.prefill_message);
      return NextResponse.redirect(waUrl);
    }
  }

  return new NextResponse(
    `<!doctype html><html><body style="font-family:system-ui;padding:2rem;text-align:center">
      <h1>${link.product_title ?? "Product"}</h1>
      <p>WhatsApp is not connected for this store yet. Please try again later.</p>
    </body></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
