import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  authErrorResponse,
  loadOwnedConversation,
} from "@/lib/inbox/inbox-api-auth";
import {
  loadConversationChatHistory,
  placeManualInboxOrder,
} from "@/lib/inbox/manual-order";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Store } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      conversationId?: string;
      customerName?: string;
      phone?: string;
      address1?: string;
      city?: string;
      quantity?: number;
      variantId?: string;
      productId?: string;
      sku?: string;
      discountPercent?: number | null;
    };

    const conversationId = body.conversationId?.trim();
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const loaded = await loadOwnedConversation({
      storeId,
      conversationId,
      requireManual: true,
    });
    if ("error" in loaded && loaded.error) return loaded.error;

    const { conversation } = loaded;
    const supabase = createAdminClient();
    const { data: storeRow, error: storeError } = await supabase
      .from("stores")
      .select("*")
      .eq("id", storeId)
      .single();

    if (storeError || !storeRow) {
      return NextResponse.json({ error: "Store not found" }, { status: 400 });
    }

    const history = await loadConversationChatHistory(conversationId);

    const result = await placeManualInboxOrder({
      store: storeRow as Store,
      conversationId,
      customerPhone: String(conversation.customer_phone),
      customerId: (conversation.customer_id as string | null) ?? null,
      history,
      overrides: {
        customerName: body.customerName,
        phone: body.phone,
        address1: body.address1,
        city: body.city,
        quantity: body.quantity,
        variantId: body.variantId,
        productId: body.productId,
        sku: body.sku,
        discountPercent: body.discountPercent,
      },
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      totalFormatted: result.totalFormatted,
      confirmationText: result.confirmationText,
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("[inbox/place-order]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to place order" },
      { status: 500 }
    );
  }
}
