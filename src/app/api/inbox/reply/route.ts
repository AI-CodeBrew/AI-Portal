import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStoreWhatsAppCredentials,
  sendWhatsAppText,
} from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const { conversationId, message, newStatus } = (await request.json()) as {
      conversationId: string;
      message: string;
      newStatus?: "ai_handling" | "closed";
    };

    const supabase = createAdminClient();

    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("*, stores(*)")
      .eq("id", conversationId)
      .eq("store_id", storeId)
      .single();

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const store = conversation.stores as {
      whatsapp_phone_number_id: string | null;
      whatsapp_access_token: string | null;
    };

    const waCreds = getStoreWhatsAppCredentials(store);
    if (!waCreds) {
      return NextResponse.json(
        { error: "WhatsApp not configured" },
        { status: 400 }
      );
    }

    await sendWhatsAppText({
      phoneNumberId: waCreds.phoneNumberId,
      accessToken: waCreds.accessToken,
      to: conversation.customer_phone,
      text: message,
    });

    await supabase.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      direction: "out",
      content: message,
    });

    if (newStatus) {
      await supabase
        .from("whatsapp_conversations")
        .update({ status: newStatus })
        .eq("id", conversationId);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
