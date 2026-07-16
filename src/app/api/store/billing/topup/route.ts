import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTopupPack, type TopupPackId } from "@/lib/ai/topup";
import { getBillingAvailability } from "@/lib/payments/paytabs";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const supabase = createAdminClient();
    const billing = await getBillingAvailability();

    const { data: payments } = await supabase
      .from("ai_topup_payments")
      .select("id, credits, amount, currency, status, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      available: billing.available,
      currency: billing.currency || "AED",
      payments: payments ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * Start an AI credit top-up (available on Basic and all plans).
 * Requires PayTabs to be connected; credits are applied only after payment
 * is confirmed (via PayTabs callback once the live API is wired).
 */
export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as { packId?: TopupPackId };
    const pack = getTopupPack(body.packId);
    if (!pack) {
      return NextResponse.json({ error: "Invalid top-up pack" }, { status: 400 });
    }

    const billing = await getBillingAvailability();
    if (!billing.available) {
      return NextResponse.json(
        {
          error:
            "Billing is not available yet. The platform admin must connect PayTabs first.",
        },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const cartId = `topup_${storeId.slice(0, 8)}_${Date.now()}`;

    const { data: payment, error } = await supabase
      .from("ai_topup_payments")
      .insert({
        store_id: storeId,
        credits: pack.credits,
        amount: pack.priceAed,
        currency: billing.currency || "AED",
        status: "pending",
        paytabs_cart_id: cartId,
        metadata: {
          pack_id: pack.id,
          note: "Awaiting PayTabs hosted payment API. Wire payment/request next.",
        },
      })
      .select("id, credits, amount, currency, status")
      .single();

    if (error) {
      const hint = error.message.includes("ai_topup_payments")
        ? " — Run migration 019_feature_pack.sql in Supabase"
        : "";
      return NextResponse.json(
        { error: error.message + hint },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      payment,
      creditsAdded: 0,
      checkoutUrl: null,
      message:
        "Checkout created. PayTabs hosted page will open here once the payment API is connected. Your top-up is saved as pending.",
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
