import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStoreProduct,
  getPrimaryProductImageUrl,
} from "@/lib/products/products-service";
import {
  formatProductCardForWhatsApp,
  portalHitToSearchProduct,
} from "@/lib/ai/product-reply";
import { formatMoney } from "@/lib/currency";
import {
  authErrorResponse,
  loadOwnedConversation,
} from "@/lib/inbox/inbox-api-auth";
import {
  inboxCatalogProductToSearchProduct,
  loadShopifyProductForInboxSend,
} from "@/lib/inbox/inbox-product-search";
import { sendWhatsAppOutboundMessage } from "@/lib/inbox/send-whatsapp-outbound";
import type { WindowType } from "@/lib/whatsapp-window/window-status";
import type { Store } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      conversationId?: string;
      source?: "portal" | "shopify";
      productId?: string;
      variantId?: string;
    };

    const conversationId = body.conversationId?.trim();
    const productId = body.productId?.trim();
    const variantId = body.variantId?.trim();
    const source = body.source === "shopify" ? "shopify" : "portal";

    if (!conversationId || !productId) {
      return NextResponse.json(
        { error: "conversationId and productId are required" },
        { status: 400 }
      );
    }

    const loaded = await loadOwnedConversation({
      storeId,
      conversationId,
      requireManual: true,
    });
    if ("error" in loaded && loaded.error) return loaded.error;

    const { conversation, store } = loaded;

    const supabase = createAdminClient();
    const { data: storeRow, error: storeError } = await supabase
      .from("stores")
      .select("*")
      .eq("id", storeId)
      .single();

    if (storeError || !storeRow) {
      return NextResponse.json({ error: "Store not found" }, { status: 400 });
    }

    let content: string;
    let previewTitle: string;
    let previewPrice: string;

    if (source === "shopify") {
      const shopifyProduct = await loadShopifyProductForInboxSend(
        storeRow as Store,
        productId,
        variantId || undefined
      );
      if (!shopifyProduct) {
        return NextResponse.json(
          { error: "Shopify product not found" },
          { status: 404 }
        );
      }
      if (shopifyProduct.variants.length > 1 && !variantId) {
        return NextResponse.json(
          { error: "Select a variant before sending this Shopify product." },
          { status: 400 }
        );
      }

      const searchProduct = inboxCatalogProductToSearchProduct(shopifyProduct);
      content = formatProductCardForWhatsApp(searchProduct, {
        variantId:
          variantId ||
          shopifyProduct.variants[0]?.id ||
          undefined,
      });
      previewTitle = shopifyProduct.title;
      previewPrice =
        shopifyProduct.variants.find((v) => v.id === variantId)?.priceFormatted ??
        shopifyProduct.variants[0]?.priceFormatted ??
        shopifyProduct.price;
    } else {
      const product = await getStoreProduct(storeId, productId);
      if (!product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }

      const hit = {
        id: product.id,
        title: product.name,
        description: product.description || product.tagline || null,
        sku: product.sku,
        price: String(product.price),
        currency: product.currency,
        imageUrl: getPrimaryProductImageUrl(product),
        image_urls: product.image_urls ?? [],
        options: (product.options ?? []).map((o) => ({
          name: o.name,
          values: o.values ?? [],
        })),
        variants: (product.variants ?? []).map((v) => ({
          id: v.id,
          title: v.title,
          sku: v.sku,
          price: String(v.price ?? product.price),
          option_values: v.option_values ?? {},
        })),
        bundles: (product.bundles ?? []).map((b) => ({
          quantity: b.quantity,
          price: String(b.price),
          label: b.label,
        })),
      };

      const searchProduct = portalHitToSearchProduct(hit);
      content = formatProductCardForWhatsApp(searchProduct, {
        variantId: variantId || undefined,
      });
      previewTitle = product.name;
      previewPrice = formatMoney(Number(product.price), product.currency);
    }

    const sendResult = await sendWhatsAppOutboundMessage({
      conversationId,
      customerPhone: String(conversation.customer_phone),
      store: store as {
        whatsapp_phone_number_id: string | null;
        whatsapp_access_token: string | null;
      },
      content,
      lastCustomerMessageAt: conversation.last_customer_message_at as string | null,
      windowType: (conversation.window_type as WindowType | null) ?? "service",
    });

    if (!sendResult.ok) {
      return NextResponse.json(
        {
          error: sendResult.error,
          windowClosed: sendResult.windowClosed ?? false,
        },
        { status: sendResult.windowClosed ? 400 : 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      preview: {
        title: previewTitle,
        priceFormatted: previewPrice,
      },
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("[inbox/send-product]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send product" },
      { status: 500 }
    );
  }
}
