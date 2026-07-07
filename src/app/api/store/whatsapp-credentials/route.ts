import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { encrypt } from "@/lib/crypto";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      metaAppId?: string;
      metaAppSecret?: string;
      metaConfigId?: string;
      verifyToken?: string;
    };

    const { metaAppId, metaAppSecret, metaConfigId, verifyToken } = body;

    if (!metaAppId?.trim()) {
      return NextResponse.json(
        { error: "Meta App ID is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: current } = await supabase
      .from("stores")
      .select("meta_app_secret, whatsapp_verify_token")
      .eq("id", storeId)
      .single();

    if (!metaAppSecret?.trim() && !current?.meta_app_secret) {
      return NextResponse.json(
        { error: "Meta App Secret is required for first-time setup" },
        { status: 400 }
      );
    }

    const updatePayload: Record<string, string | null> = {
      meta_app_id: metaAppId.trim(),
      meta_config_id: metaConfigId?.trim() || null,
      whatsapp_verify_token:
        verifyToken?.trim() ||
        current?.whatsapp_verify_token ||
        randomBytes(16).toString("hex"),
    };

    if (metaAppSecret?.trim()) {
      updatePayload.meta_app_secret = encrypt(metaAppSecret.trim());
    }

    const { error } = await supabase
      .from("stores")
      .update(updatePayload)
      .eq("id", storeId);

    if (error) {
      const hint =
        error.message.includes("meta_app_id") || error.message.includes("column")
          ? " — Run migration 006_whatsapp_per_store.sql in Supabase SQL Editor"
          : "";
      return NextResponse.json(
        { error: error.message + hint },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      verifyToken: updatePayload.whatsapp_verify_token,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
