import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export function authErrorResponse(err: unknown) {
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

export async function loadOwnedConversation(params: {
  storeId: string;
  conversationId: string;
  requireManual?: boolean;
}) {
  const supabase = createAdminClient();
  const { data: conversation, error } = await supabase
    .from("whatsapp_conversations")
    .select(
      "id, customer_phone, customer_id, store_id, status, last_customer_message_at, window_type, stores(*)"
    )
    .eq("id", params.conversationId)
    .eq("store_id", params.storeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!conversation) {
    return { error: NextResponse.json({ error: "Conversation not found" }, { status: 404 }) };
  }
  if (params.requireManual && conversation.status !== "human_handoff") {
    return {
      error: NextResponse.json(
        { error: "Switch this chat to Human mode to use agent tools." },
        { status: 400 }
      ),
    };
  }

  const storeRaw = conversation.stores as
    | Record<string, unknown>
    | Record<string, unknown>[]
    | null;
  const store = Array.isArray(storeRaw) ? storeRaw[0] : storeRaw;
  if (!store) {
    return {
      error: NextResponse.json(
        { error: "Store not found for this conversation" },
        { status: 400 }
      ),
    };
  }

  return { conversation, store };
}
