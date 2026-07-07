import { NextRequest, NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exchangeEmbeddedSignupToken,
  getStoreMetaCredentials,
  subscribeWabaWebhooks,
} from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      code?: string;
      phone_number_id?: string;
      waba_id?: string;
      access_token?: string;
    };

    const { code, phone_number_id, waba_id, access_token } = body;

    const supabase = createAdminClient();
    const { data: store } = await supabase
      .from("stores")
      .select("meta_app_id, meta_app_secret")
      .eq("id", storeId)
      .single();

    const metaCreds = store ? getStoreMetaCredentials(store) : null;

    let token = access_token;

    if (code && !token) {
      if (!metaCreds) {
        return NextResponse.json(
          {
            error:
              "Save your Meta App ID and secret first, then try connecting again.",
          },
          { status: 400 }
        );
      }
      const tokenData = await exchangeEmbeddedSignupToken(code, metaCreds);
      token = tokenData.access_token;
    }

    if (!token || !phone_number_id || !waba_id) {
      return NextResponse.json(
        {
          error:
            "Phone Number ID, WABA ID, and Access Token are required. Use embedded signup or enter them manually.",
        },
        { status: 400 }
      );
    }

    await supabase
      .from("stores")
      .update({
        whatsapp_phone_number_id: phone_number_id,
        whatsapp_waba_id: waba_id,
        whatsapp_access_token: encrypt(token),
      })
      .eq("id", storeId);

    try {
      await subscribeWabaWebhooks(waba_id, token);
    } catch (err) {
      console.error("WABA subscription error:", err);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "WhatsApp connection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
