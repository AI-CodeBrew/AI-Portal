import { NextRequest, NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformMetaCredentials } from "@/lib/platform/meta-settings";
import {
  exchangeEmbeddedSignupToken,
  friendlyMetaError,
  getWhatsAppDisplayPhone,
  registerWhatsAppPhoneNumber,
  resolveWhatsAppAssetsFromToken,
  subscribeWabaWebhooks,
} from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      code?: string;
      phone_number_id?: string;
      waba_id?: string;
      business_id?: string;
      access_token?: string;
    };

    const { code, phone_number_id, waba_id, business_id, access_token } = body;
    const platformMeta = await getPlatformMetaCredentials();

    if (!platformMeta) {
      return NextResponse.json(
        {
          error:
            "WhatsApp is not ready yet. Please contact support — the platform Meta app is not configured.",
        },
        { status: 503 }
      );
    }

    let token = access_token;

    if (code && !token) {
      try {
        const tokenData = await exchangeEmbeddedSignupToken(code, {
          appId: platformMeta.appId,
          appSecret: platformMeta.appSecret,
        });
        token = tokenData.access_token;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Could not finish WhatsApp signup";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    let resolvedPhoneId = phone_number_id?.trim() || undefined;
    let resolvedWabaId = waba_id?.trim() || undefined;

    if (token && (!resolvedPhoneId || !resolvedWabaId)) {
      try {
        const resolved = await resolveWhatsAppAssetsFromToken(
          token,
          {
            appId: platformMeta.appId,
            appSecret: platformMeta.appSecret,
          },
          {
            waba_id: resolvedWabaId,
            phone_number_id: resolvedPhoneId,
            business_id: business_id?.trim(),
          }
        );
        resolvedPhoneId = resolvedPhoneId || resolved.phone_number_id || undefined;
        resolvedWabaId = resolvedWabaId || resolved.waba_id || undefined;
      } catch (err) {
        console.warn("[whatsapp/connect] resolve assets:", err);
      }
    }

    if (!token) {
      return NextResponse.json(
        {
          error:
            "Facebook login finished but we did not receive an access token. Try Connect WhatsApp again.",
        },
        { status: 400 }
      );
    }

    if (!resolvedWabaId) {
      return NextResponse.json(
        {
          error:
            "Facebook did not share a WhatsApp Business account. Click Connect WhatsApp again, pick or create a WhatsApp account in the popup, and finish every screen.",
        },
        { status: 400 }
      );
    }

    if (!resolvedPhoneId) {
      return NextResponse.json(
        {
          error:
            "WhatsApp account was created, but no phone number was added. Click Connect WhatsApp again and add + verify a new number in the Facebook popup.",
        },
        { status: 400 }
      );
    }

    try {
      await registerWhatsAppPhoneNumber(resolvedPhoneId, token);
    } catch (err) {
      console.warn("[whatsapp/connect] register phone:", err);
    }

    try {
      await subscribeWabaWebhooks(resolvedWabaId, token);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not enable message delivery for this number";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    let displayPhone: string | null = null;
    try {
      displayPhone = await getWhatsAppDisplayPhone(resolvedPhoneId, token);
    } catch {
      // optional
    }

    const supabase = createAdminClient();
    const { error: updateError } = await supabase
      .from("stores")
      .update({
        whatsapp_phone_number_id: resolvedPhoneId,
        whatsapp_waba_id: resolvedWabaId,
        whatsapp_access_token: encrypt(token),
        whatsapp_display_phone: displayPhone,
      })
      .eq("id", storeId);

    if (updateError) {
      const hint = updateError.message.includes("whatsapp_display_phone")
        ? " — Run migration 023_platform_settings.sql in Supabase"
        : "";
      return NextResponse.json(
        { error: updateError.message + hint },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      phone_number_id: resolvedPhoneId,
      waba_id: resolvedWabaId,
      display_phone: displayPhone,
    });
  } catch (err) {
    const raw =
      err instanceof Error ? err.message : "WhatsApp connection failed";
    return NextResponse.json(
      {
        error: friendlyMetaError(
          raw,
          "WhatsApp connection failed. Please try again."
        ),
      },
      { status: 500 }
    );
  }
}

/** Clear WhatsApp credentials from this store (portal disconnect). */
export async function DELETE() {
  try {
    const { storeId } = await requireResellerStore();
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("stores")
      .update({
        whatsapp_phone_number_id: null,
        whatsapp_waba_id: null,
        whatsapp_access_token: null,
        whatsapp_display_phone: null,
      })
      .eq("id", storeId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
