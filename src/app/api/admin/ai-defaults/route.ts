import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getPlatformAiDefaults,
  updatePlatformAiDefaults,
} from "@/lib/ai/platform-defaults";
import type { AiReplyLength } from "@/lib/ai/ai-settings-types";
import { createAdminClient } from "@/lib/supabase/admin";

async function listPlatformTemplates() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ai_prompt_templates")
    .select("*")
    .is("store_id", null)
    .order("name", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id as string,
    store_id: null,
    slug: (row.slug as string | null) ?? null,
    category: row.category,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    prompt_content: row.prompt_content as string,
    created_at: row.created_at as string,
    isPredefined: true,
  }));
}

export async function GET() {
  try {
    await requireAuth("admin");
    const [settings, templates] = await Promise.all([
      getPlatformAiDefaults(),
      listPlatformTemplates(),
    ]);
    return NextResponse.json({ settings, templates });
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
      orderTemplateId?: string | null;
      generalTemplateId?: string | null;
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
