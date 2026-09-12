import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { getStoreWithIntegrations } from "@/lib/ads/ad-links-service";
import { getStoreWhatsAppCredentials } from "@/lib/whatsapp";
import {
  getShopifyCatalogSyncState,
  listCachedShopifyProducts,
} from "@/lib/shopify/cached-catalog";

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "10");
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 10, 1), 100);
    const pageRaw = Number(request.nextUrl.searchParams.get("page") ?? "1");
    const page = Math.max(Number.isFinite(pageRaw) ? pageRaw : 1, 1);

    const [pageData, syncState, store] = await Promise.all([
      listCachedShopifyProducts(storeId, {
        query: q || undefined,
        page,
        limit,
      }),
      getShopifyCatalogSyncState(storeId),
      getStoreWithIntegrations(storeId),
    ]);

    const waCreds = store ? getStoreWhatsAppCredentials(store) : null;

    return NextResponse.json({
      products: pageData.products,
      totalCount: pageData.totalCount,
      hasNextPage: pageData.hasNextPage,
      hasPreviousPage: pageData.hasPreviousPage,
      nextCursor: null,
      previousCursor: null,
      pageSize: pageData.pageSize,
      currency: pageData.currency,
      whatsappConnected: Boolean(waCreds?.phoneNumberId),
      connected: syncState.connected,
      lastSyncedAt: syncState.lastSyncedAt,
      syncing: syncState.syncing && pageData.totalCount === 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    const status = message === "Unauthorized" || message.includes("Unauthorized")
      ? 401
      : 500;
    return NextResponse.json(
      { error: status === 401 ? "Unauthorized" : message },
      { status }
    );
  }
}
