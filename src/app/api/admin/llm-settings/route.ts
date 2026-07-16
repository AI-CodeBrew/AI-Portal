import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getPlatformLlmAdminView,
  updatePlatformLlmSettings,
  type AiLlmProvider,
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
      provider?: AiLlmProvider;
      geminiApiKey?: string;
      geminiModel?: string;
      groqApiKey?: string;
      groqModel?: string;
      clearGeminiApiKey?: boolean;
      clearGroqApiKey?: boolean;
    };

    const result = await updatePlatformLlmSettings({
      provider: body.provider,
      geminiApiKey: body.geminiApiKey,
      geminiModel: body.geminiModel,
      groqApiKey: body.groqApiKey,
      groqModel: body.groqModel,
      clearGeminiApiKey: body.clearGeminiApiKey,
      clearGroqApiKey: body.clearGroqApiKey,
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
