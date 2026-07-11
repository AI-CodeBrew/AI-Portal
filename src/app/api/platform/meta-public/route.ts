import { NextResponse } from "next/server";
import { getPlatformMetaPublic } from "@/lib/platform/meta-settings";

/**
 * Public-safe Meta values for Embedded Signup (App ID + Config ID only).
 * Never returns the App Secret.
 */
export async function GET() {
  try {
    const data = await getPlatformMetaPublic();
    return NextResponse.json({
      metaAppId: data.metaAppId,
      metaConfigId: data.metaConfigId,
      configured: data.configured,
    });
  } catch (err) {
    console.error("[platform/meta-public]", err);
    return NextResponse.json(
      {
        metaAppId: null,
        metaConfigId: null,
        configured: false,
        error: "Platform WhatsApp is not configured yet",
      },
      { status: 200 }
    );
  }
}
