import { NextResponse } from "next/server";

/**
 * PayTabs IPN / callback webhook.
 * Wire signature verification + plan activation when connecting the live API.
 */
export async function POST(request: Request) {
  const body = await request.text();
  console.log("[paytabs-callback] received (stub):", body.slice(0, 500));

  // TODO:
  // 1. Verify PayTabs signature / tran_ref
  // 2. Find plan_payments by cart_id / tran_ref
  // 3. Mark paid + setStorePlan(storeId, planId)

  return NextResponse.json({
    ok: true,
    message: "Callback endpoint ready — wire PayTabs verification next",
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "PayTabs callback endpoint",
  });
}
