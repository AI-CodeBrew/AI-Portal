import { NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { getResellerDashboardStats } from "@/lib/dashboard/reseller-stats";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const stats = await getResellerDashboardStats(storeId);
    return NextResponse.json({ stats });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
