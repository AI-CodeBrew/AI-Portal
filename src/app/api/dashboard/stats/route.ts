import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { getResellerDashboardStats } from "@/lib/dashboard/reseller-stats";
import { parseDashboardPeriod } from "@/lib/dashboard/period";

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const period = parseDashboardPeriod(
      request.nextUrl.searchParams.get("period")
    );
    const stats = await getResellerDashboardStats(storeId, period);
    return NextResponse.json({ stats });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
