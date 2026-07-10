import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getPlatformAiDefaults,
  updatePlatformAiDefaults,
} from "@/lib/ai/platform-defaults";
import type { AiReplyLength, AiTone } from "@/lib/ai/ai-settings-types";

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
    const body = (await request.json()) as {
      agentName?: string | null;
      openingMessage?: string | null;
      replyLength?: AiReplyLength;
      tone?: AiTone;
      platformName?: string | null;
      supportEmail?: string | null;
      supportPhone?: string | null;
    };

    const result = await updatePlatformAiDefaults(body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ settings: result });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
