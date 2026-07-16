import { NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { promoteOutcomeToExample } from "@/lib/outcomes/promote-example";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: RouteContext) {
  try {
    const { storeId } = await requireResellerStore();
    const { id } = await context.params;

    const result = await promoteOutcomeToExample(storeId, id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      exampleId: result.exampleId,
      deactivatedId: result.deactivatedId,
      message: result.deactivatedId
        ? "Promoted. Oldest active example was auto-deactivated (max 5)."
        : "Promoted to live agent examples.",
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
