import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getPlatformLlmAdminView } from "@/lib/platform/llm-settings";

export async function GET() {
  try {
    await requireAuth("admin");
    const settings = await getPlatformLlmAdminView();
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** Models and API key are env-only; admin cannot change them. */
export async function PATCH() {
  try {
    await requireAuth("admin");
    return NextResponse.json(
      {
        error:
          "Gemini API key and models are configured via environment variables and cannot be changed here.",
      },
      { status: 405 }
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
