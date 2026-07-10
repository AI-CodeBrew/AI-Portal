import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  createPlanCheckout,
  getBillingAvailability,
  listStorePlanPayments,
} from "@/lib/payments/paytabs";
import type { PlanId } from "@/lib/ai/plans";
import { AI_PLANS } from "@/lib/ai/plans";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const [billing, payments] = await Promise.all([
      getBillingAvailability(),
      listStorePlanPayments(storeId),
    ]);
    return NextResponse.json({ billing, payments });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as { planId?: PlanId };

    if (!body.planId || !(body.planId in AI_PLANS)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const result = await createPlanCheckout(storeId, body.planId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
