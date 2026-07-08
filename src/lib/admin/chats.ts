import { createAdminClient } from "@/lib/supabase/admin";
import type { WhatsappConversation, WhatsappMessage } from "@/lib/types";

export async function getAdminConversations(
  storeId: string
): Promise<WhatsappConversation[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("store_id", storeId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[admin/chats] conversations:", error.message);
    return [];
  }

  return data ?? [];
}

export async function getAdminConversationMessages(
  conversationId: string
): Promise<WhatsappMessage[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[admin/chats] messages:", error.message);
    return [];
  }

  return data ?? [];
}
