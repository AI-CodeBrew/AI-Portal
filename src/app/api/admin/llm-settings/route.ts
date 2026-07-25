import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getPlatformLlmAdminView,
  updatePlatformLlmSettings,
} from "@/lib/platform/llm-settings";

export async function GET() {
  try {
    await requireAuth("admin");
    const settings = await getPlatformLlmAdminView();
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth("admin");
    const body = (await request.json()) as {
      geminiApiKey?: string;
      geminiModel?: string;
      geminiIntentModel?: string;
      clearGeminiApiKey?: boolean;
    };

    const result = await updatePlatformLlmSettings({
      geminiApiKey: body.geminiApiKey,
      geminiModel: body.geminiModel,
      geminiIntentModel: body.geminiIntentModel,
      clearGeminiApiKey: body.clearGeminiApiKey,
      updatedBy: user.id,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ settings: result });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
