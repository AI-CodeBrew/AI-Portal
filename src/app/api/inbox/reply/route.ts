import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStoreWhatsAppCredentials,
  normalizePhone,
  sendWhatsAppText,
} from "@/lib/whatsapp";

function authErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : "";
  if (message === "UNAUTHORIZED" || message === "FORBIDDEN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (message === "NO_STORE") {
    return NextResponse.json(
      { error: "No store linked to this account" },
      { status: 400 }
    );
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const body = (await request.json()) as {
      conversationId?: string;
      message?: string;
      newStatus?: "ai_handling" | "closed";
    };

    const conversationId = body.conversationId?.trim();
    const message = body.message?.trim();

    if (!conversationId || !message) {
      return NextResponse.json(
        { error: "conversationId and message are required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: conversation, error: convError } = await supabase
      .from("whatsapp_conversations")
      .select("id, customer_phone, store_id, stores(whatsapp_phone_number_id, whatsapp_access_token)")
      .eq("id", conversationId)
      .eq("store_id", storeId)
      .maybeSingle();

    if (convError) {
      return NextResponse.json({ error: convError.message }, { status: 500 });
    }

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const storeRaw = conversation.stores as
      | {
          whatsapp_phone_number_id: string | null;
          whatsapp_access_token: string | null;
        }
      | {
          whatsapp_phone_number_id: string | null;
          whatsapp_access_token: string | null;
        }[]
      | null;

    const store = Array.isArray(storeRaw) ? storeRaw[0] : storeRaw;

    if (!store) {
      return NextResponse.json(
        { error: "Store not found for this conversation" },
        { status: 400 }
      );
    }

    const waCreds = getStoreWhatsAppCredentials(store);
    if (!waCreds) {
      return NextResponse.json(
        {
          error:
            "WhatsApp is not connected or the access token could not be decrypted. Reconnect WhatsApp in Integrations.",
        },
        { status: 400 }
      );
    }

    const to = normalizePhone(conversation.customer_phone);
    if (!to || to.length < 8) {
      return NextResponse.json(
        { error: `Invalid customer phone number: ${conversation.customer_phone}` },
        { status: 400 }
      );
    }

    try {
      await sendWhatsAppText({
        phoneNumberId: waCreds.phoneNumberId,
        accessToken: waCreds.accessToken,
        to,
        text: message,
      });
    } catch (sendErr) {
      const detail =
        sendErr instanceof Error ? sendErr.message : "WhatsApp send failed";
      console.error("[inbox/reply] WhatsApp send failed:", detail);
      return NextResponse.json(
        {
          error:
            "Could not deliver message to WhatsApp. " +
            "If the customer last messaged more than 24 hours ago, Meta requires an approved template. " +
            `Details: ${detail}`,
        },
        { status: 502 }
      );
    }

    const { error: insertError } = await supabase
      .from("whatsapp_messages")
      .insert({
        conversation_id: conversationId,
        direction: "out",
        content: message,
      });

    if (insertError) {
      console.error("[inbox/reply] DB insert failed after send:", insertError.message);
      return NextResponse.json(
        {
          error:
            "Message was sent on WhatsApp but failed to save in the portal. Refresh and check the chat.",
        },
        { status: 500 }
      );
    }

    const conversationUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.newStatus) {
      conversationUpdate.status = body.newStatus;
    }

    await supabase
      .from("whatsapp_conversations")
      .update(conversationUpdate)
      .eq("id", conversationId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("[inbox/reply]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send reply" },
      { status: 500 }
    );
  }
}
