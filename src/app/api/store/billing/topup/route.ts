import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTopupPack, type TopupPackId } from "@/lib/ai/topup";
import { applyTopupCredits } from "@/lib/ai/quota";
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
 * Until PayTabs live checkout is wired, creates a pending payment and
 * immediately applies credits in stub mode so resellers can use top-ups.
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
    const supabase = createAdminClient();
    const cartId = `topup_${storeId.slice(0, 8)}_${Date.now()}`;

    const { data: payment, error } = await supabase
      .from("ai_topup_payments")
      .insert({
        store_id: storeId,
        credits: pack.credits,
        amount: pack.priceAed,
        currency: billing.currency || "AED",
        status: "paid",
        paytabs_cart_id: cartId,
        metadata: {
          pack_id: pack.id,
          stub: true,
          note: "Credits applied immediately until PayTabs top-up checkout is live",
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

    const applied = await applyTopupCredits(storeId, pack.credits);
    if (!applied.ok) {
      return NextResponse.json(
        { error: applied.error ?? "Failed to apply credits" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      payment,
      creditsAdded: pack.credits,
      message: `${pack.credits} AI message credits added to your store.`,
      checkoutUrl: null,
      billingAvailable: billing.available,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
