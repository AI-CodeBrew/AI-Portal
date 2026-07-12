import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getPlatformAiDefaults,
  updatePlatformAiDefaults,
  type PlatformAiDefaultsInput,
} from "@/lib/ai/platform-defaults";

export async function GET() {
  try {
    await requireAuth("admin");
    const settings = await getPlatformAiDefaults();
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth("admin");
    const body = (await request.json()) as PlatformAiDefaultsInput;

    const result = await updatePlatformAiDefaults(body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ settings: result });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
