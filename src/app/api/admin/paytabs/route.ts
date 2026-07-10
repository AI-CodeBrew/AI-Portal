import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  disconnectPlatformPayTabs,
  getPlatformPayTabsCredentials,
  listAllPlanPayments,
  updatePlatformPayTabsCredentials,
  type PayTabsRegion,
} from "@/lib/payments/paytabs";

export async function GET() {
  try {
    await requireAuth("admin");
    const [credentials, payments] = await Promise.all([
      getPlatformPayTabsCredentials(),
      listAllPlanPayments(40),
    ]);
    return NextResponse.json({ credentials, payments });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth("admin");
    const body = (await request.json()) as {
      action?: "save" | "disconnect";
      profileId?: string;
      serverKey?: string;
      clientKey?: string | null;
      merchantEmail?: string | null;
      region?: PayTabsRegion;
      currency?: string;
      testMode?: boolean;
    };

    if (body.action === "disconnect") {
      const result = await disconnectPlatformPayTabs();
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        credentials: await getPlatformPayTabsCredentials(),
      });
    }

    const result = await updatePlatformPayTabsCredentials({
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
