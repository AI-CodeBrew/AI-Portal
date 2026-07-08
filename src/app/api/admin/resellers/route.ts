import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminResellers } from "@/lib/admin/resellers";

export async function GET() {
  try {
    await requireAuth("admin");
    const { resellers, error } = await getAdminResellers();

    if (error) {
      return NextResponse.json({ error, resellers: [] }, { status: 500 });
    }

    return NextResponse.json({ resellers });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
