import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminPlatformStats } from "@/lib/admin/stats";

export async function GET() {
  try {
    await requireAuth("admin");
    const stats = await getAdminPlatformStats();
    return NextResponse.json({ stats });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
