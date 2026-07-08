import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  getStoreAiSettings,
  listAiTemplates,
  updateStoreAiSettings,
} from "@/lib/ai/store-ai-settings";
import type { AiReplyLength } from "@/lib/ai/ai-settings-types";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const [settings, templates] = await Promise.all([
      getStoreAiSettings(storeId),
      listAiTemplates(storeId),
    ]);

    return NextResponse.json({ settings, templates });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      agentName?: string | null;
      openingMessage?: string | null;
      replyLength?: AiReplyLength;
      orderTemplateId?: string | null;
      generalTemplateId?: string | null;
    };

    const result = await updateStoreAiSettings(storeId, body);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ settings: result });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
