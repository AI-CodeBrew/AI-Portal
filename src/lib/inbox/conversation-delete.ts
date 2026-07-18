import {
  closeOpenConversationsForPhone,
  markAiSessionReset,
} from "@/lib/ai/session-reset";
import { createAdminClient } from "@/lib/supabase/admin";

export type DeleteConversationsResult = {
  deletedCount: number;
  notFoundIds: string[];
};

/** Delete inbox conversations and reset AI session for each affected customer. */
export async function deleteStoreConversations(
  storeId: string,
  conversationIds: string[]
): Promise<DeleteConversationsResult> {
  const uniqueIds = [...new Set(conversationIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) {
    return { deletedCount: 0, notFoundIds: [] };
  }

  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("whatsapp_conversations")
    .select("id, customer_phone")
    .eq("store_id", storeId)
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  const foundRows = rows ?? [];
  const foundIds = new Set(foundRows.map((row) => row.id as string));
  const notFoundIds = uniqueIds.filter((id) => !foundIds.has(id));

  if (!foundIds.size) {
    return { deletedCount: 0, notFoundIds };
  }

  const phones = [
    ...new Set(
      foundRows
        .map((row) => String(row.customer_phone ?? "").trim())
        .filter(Boolean)
    ),
  ];

  for (const phone of phones) {
    await markAiSessionReset(storeId, phone);
    await closeOpenConversationsForPhone(storeId, phone);
  }

  const { error: deleteError } = await supabase
    .from("whatsapp_conversations")
    .delete()
    .eq("store_id", storeId)
    .in("id", [...foundIds]);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  return { deletedCount: foundIds.size, notFoundIds };
}
