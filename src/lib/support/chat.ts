import { createAdminClient } from "@/lib/supabase/admin";

export type SupportSenderRole = "admin" | "reseller";

export type SupportConversation = {
  id: string;
  store_id: string;
  reseller_user_id: string | null;
  status: "open" | "closed";
  last_message_at: string;
  admin_unread: boolean;
  reseller_unread: boolean;
  admin_cleared_at: string | null;
  reseller_cleared_at: string | null;
  created_at: string;
  stores?: {
    store_name: string | null;
    shop_domain: string | null;
    owner_email: string | null;
  } | null;
};

export type SupportMessage = {
  id: string;
  conversation_id: string;
  sender_role: SupportSenderRole;
  sender_user_id: string | null;
  content: string;
  created_at: string;
};

export async function getOrCreateConversation(
  storeId: string,
  resellerUserId?: string | null
): Promise<SupportConversation | { error: string }> {
  const supabase = createAdminClient();

  const { data: existing, error: findErr } = await supabase
    .from("support_conversations")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();

  if (findErr) {
    const hint = findErr.message.includes("support_conversations")
      ? " — Run migration 019_feature_pack.sql"
      : "";
    return { error: findErr.message + hint };
  }

  if (existing) {
    if (resellerUserId && !existing.reseller_user_id) {
      await supabase
        .from("support_conversations")
        .update({ reseller_user_id: resellerUserId })
        .eq("id", existing.id);
      return {
        ...existing,
        reseller_user_id: resellerUserId,
      } as SupportConversation;
    }
    return existing as SupportConversation;
  }

  const { data: created, error } = await supabase
    .from("support_conversations")
    .insert({
      store_id: storeId,
      reseller_user_id: resellerUserId ?? null,
      status: "open",
    })
    .select("*")
    .single();

  if (error || !created) {
    const hint = error?.message?.includes("support_conversations")
      ? " — Run migration 019_feature_pack.sql"
      : "";
    return { error: (error?.message ?? "Failed to create conversation") + hint };
  }

  return created as SupportConversation;
}

export async function listMessages(
  conversationId: string,
  options?: { forRole?: SupportSenderRole; limit?: number }
): Promise<SupportMessage[]> {
  const supabase = createAdminClient();
  const limit = options?.limit ?? 200;

  let clearedAt: string | null = null;
  if (options?.forRole) {
    const { data: conv } = await supabase
      .from("support_conversations")
      .select("admin_cleared_at, reseller_cleared_at")
      .eq("id", conversationId)
      .maybeSingle();
    clearedAt =
      options.forRole === "admin"
        ? ((conv?.admin_cleared_at as string | null) ?? null)
        : ((conv?.reseller_cleared_at as string | null) ?? null);
  }

  let query = supabase
    .from("support_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (clearedAt) {
    query = query.gt("created_at", clearedAt);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[support/chat] listMessages:", error.message);
    return [];
  }
  return (data ?? []) as SupportMessage[];
}

export async function sendMessage(input: {
  conversationId: string;
  role: SupportSenderRole;
  content: string;
  senderUserId?: string | null;
}): Promise<SupportMessage | { error: string }> {
  const content = input.content.trim();
  if (!content) {
    return { error: "Message cannot be empty" };
  }
  if (content.length > 4000) {
    return { error: "Message is too long" };
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: message, error } = await supabase
    .from("support_messages")
    .insert({
      conversation_id: input.conversationId,
      sender_role: input.role,
      sender_user_id: input.senderUserId ?? null,
      content,
    })
    .select("*")
    .single();

  if (error || !message) {
    return { error: error?.message ?? "Failed to send message" };
  }

  const unreadPatch =
    input.role === "admin"
      ? { reseller_unread: true, admin_unread: false }
      : { admin_unread: true, reseller_unread: false };

  await supabase
    .from("support_conversations")
    .update({
      last_message_at: now,
      status: "open",
      ...unreadPatch,
    })
    .eq("id", input.conversationId);

  return message as SupportMessage;
}

export async function markConversationRead(
  conversationId: string,
  role: SupportSenderRole
): Promise<void> {
  const supabase = createAdminClient();
  const patch =
    role === "admin"
      ? { admin_unread: false }
      : { reseller_unread: false };
  await supabase
    .from("support_conversations")
    .update(patch)
    .eq("id", conversationId);
}

/**
 * Clear chat for one side. Other side still sees history until they clear too.
 * When both sides have cleared and neither has remaining visible messages,
 * delete the conversation (and messages) from the database.
 */
export async function clearSupportChat(
  conversationId: string,
  role: SupportSenderRole
): Promise<
  | { ok: true; deleted: boolean }
  | { error: string }
> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: conv, error: findErr } = await supabase
    .from("support_conversations")
    .select("id, admin_cleared_at, reseller_cleared_at")
    .eq("id", conversationId)
    .maybeSingle();

  if (findErr || !conv) {
    return { error: findErr?.message ?? "Conversation not found" };
  }

  const patch =
    role === "admin"
      ? { admin_cleared_at: now, admin_unread: false }
      : { reseller_cleared_at: now, reseller_unread: false };

  const { error: updErr } = await supabase
    .from("support_conversations")
    .update(patch)
    .eq("id", conversationId);

  if (updErr) {
    const hint = updErr.message.includes("cleared_at")
      ? " — Run migration 021_support_chat_clear.sql in Supabase"
      : "";
    return { error: updErr.message + hint };
  }

  const adminCleared =
    role === "admin" ? now : ((conv.admin_cleared_at as string | null) ?? null);
  const resellerCleared =
    role === "reseller"
      ? now
      : ((conv.reseller_cleared_at as string | null) ?? null);

  if (!adminCleared || !resellerCleared) {
    return { ok: true, deleted: false };
  }

  // Both sides have cleared at least once — delete only if neither still has messages
  const [{ count: adminVisible }, { count: resellerVisible }] =
    await Promise.all([
      supabase
        .from("support_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .gt("created_at", adminCleared),
      supabase
        .from("support_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .gt("created_at", resellerCleared),
    ]);

  if ((adminVisible ?? 0) === 0 && (resellerVisible ?? 0) === 0) {
    const { error: delErr } = await supabase
      .from("support_conversations")
      .delete()
      .eq("id", conversationId);

    if (delErr) {
      return { error: delErr.message };
    }
    return { ok: true, deleted: true };
  }

  return { ok: true, deleted: false };
}

export async function listSupportConversations(): Promise<SupportConversation[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("support_conversations")
    .select("*, stores(store_name, shop_domain, owner_email)")
    .order("last_message_at", { ascending: false });

  if (error) {
    console.error("[support/chat] list:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const stores = Array.isArray(row.stores) ? row.stores[0] : row.stores;
    return { ...row, stores } as SupportConversation;
  });
}

export async function getConversationForStore(
  storeId: string
): Promise<SupportConversation | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("support_conversations")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();
  return (data as SupportConversation | null) ?? null;
}
