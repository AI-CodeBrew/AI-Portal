import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { setPromptExampleActive } from "@/lib/outcomes/promote-example";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { storeId } = await requireResellerStore();
    const { id } = await context.params;
    const body = (await req.json()) as { active?: boolean };

    if (typeof body.active !== "boolean") {
      return NextResponse.json(
        { error: "active (boolean) is required" },
        { status: 400 }
      );
    }

    const result = await setPromptExampleActive(storeId, id, body.active);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
