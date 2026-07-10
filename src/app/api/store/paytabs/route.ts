import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  createPlanCheckoutStub,
  disconnectStorePayTabs,
  getStorePayTabsCredentials,
  listStorePlanPayments,
  updateStorePayTabsCredentials,
  type PayTabsRegion,
} from "@/lib/payments/paytabs";
import type { PlanId } from "@/lib/ai/plans";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const [credentials, payments] = await Promise.all([
      getStorePayTabsCredentials(storeId),
      listStorePlanPayments(storeId),
    ]);
    return NextResponse.json({ credentials, payments });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      action?: "save" | "disconnect" | "checkout";
      profileId?: string;
      serverKey?: string;
      clientKey?: string | null;
      merchantEmail?: string | null;
      region?: PayTabsRegion;
      currency?: string;
      testMode?: boolean;
      planId?: PlanId;
    };

    if (body.action === "disconnect") {
      const result = await disconnectStorePayTabs(storeId);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        credentials: await getStorePayTabsCredentials(storeId),
      });
    }

    if (body.action === "checkout") {
      if (!body.planId) {
        return NextResponse.json(
          { error: "planId is required" },
          { status: 400 }
        );
      }
      const result = await createPlanCheckoutStub(storeId, body.planId);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    const result = await updateStorePayTabsCredentials(storeId, {
      profileId: body.profileId ?? "",
      serverKey: body.serverKey,
      clientKey: body.clientKey,
      merchantEmail: body.merchantEmail,
      region: body.region,
      currency: body.currency,
      testMode: body.testMode,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ credentials: result });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
