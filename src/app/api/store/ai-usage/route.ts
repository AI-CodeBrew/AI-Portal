import { NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { getStoreAiUsage } from "@/lib/ai/quota";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const usage = await getStoreAiUsage(storeId);
    return NextResponse.json({ usage });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
