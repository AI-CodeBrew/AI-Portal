import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminTopProducts } from "@/lib/admin/top-products";

export async function GET() {
  try {
    await requireAuth("admin");
    const products = await getAdminTopProducts(50);
    return NextResponse.json({ products });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
