import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import {
  getStoreAiSettings,
  updateStoreAiSettings,
} from "@/lib/ai/store-ai-settings";
import { getPlatformAiDefaults } from "@/lib/ai/platform-defaults";
import { listWhatsAppTemplates } from "@/lib/whatsapp/message-templates";
import type { AiReplyLength, StoreAiSettings } from "@/lib/ai/ai-settings-types";

export async function GET() {
  try {
    const { storeId } = await requireResellerStore();
    const [settings, platformDefaults, waTemplates] = await Promise.all([
      getStoreAiSettings(storeId),
      getPlatformAiDefaults(),
      listWhatsAppTemplates(storeId),
    ]);

    const approvedWhatsAppTemplates = waTemplates.filter(
      (t) => t.status === "approved"
    );

    return NextResponse.json({
      settings,
      platformDefaults,
      approvedWhatsAppTemplates,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as Partial<StoreAiSettings> & {
      replyLength?: AiReplyLength;
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
