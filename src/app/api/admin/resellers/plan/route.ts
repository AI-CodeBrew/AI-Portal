import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { setStorePlan } from "@/lib/ai/quota";
import { AI_PLANS, type PlanId } from "@/lib/ai/plans";

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth("admin");
    const body = (await request.json()) as {
      storeId?: string;
      planId?: string;
    };

    const { storeId, planId } = body;

    if (!storeId || !planId) {
      return NextResponse.json(
        { error: "storeId and planId are required" },
        { status: 400 }
      );
    }

    if (!(planId in AI_PLANS)) {
      return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
    }

    const result = await setStorePlan(storeId, planId as PlanId);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Failed to update plan" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, planId });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
