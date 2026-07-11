import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getPlatformMetaAdminView,
  listResellerWhatsAppStatus,
  updatePlatformMetaSettings,
} from "@/lib/platform/meta-settings";

export async function GET() {
  try {
    await requireAuth("admin");
    const [settings, resellers] = await Promise.all([
      getPlatformMetaAdminView(),
      listResellerWhatsAppStatus(),
    ]);
    return NextResponse.json({ settings, resellers });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unauthorized";
    if (message === "Unauthorized" || message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth("admin");
    const body = (await request.json()) as {
      metaAppId?: string;
      metaAppSecret?: string;
      metaConfigId?: string;
    };

    const result = await updatePlatformMetaSettings({
      metaAppId: body.metaAppId ?? "",
      metaAppSecret: body.metaAppSecret,
      metaConfigId: body.metaConfigId ?? "",
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
