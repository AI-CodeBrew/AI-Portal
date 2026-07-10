import { createAdminClient } from "@/lib/supabase/admin";
import type { WhatsappConversation, WhatsappMessage } from "@/lib/types";

export type AdminChatFilter = "all" | "ai" | "human" | "unread";

export type AdminConversation = WhatsappConversation & {
  store_name: string | null;
  shop_domain: string | null;
  admin_read_at: string | null;
  last_message_at: string | null;
  last_message_direction: "in" | "out" | null;
  /** Unread for admin: last message is inbound and newer than admin_read_at. */
  unread: boolean;
};

export type AdminChatCounts = {
  all: number;
  ai: number;
  human: number;
  unread: number;
};

function isUnread(conv: {
  last_message_direction: "in" | "out" | null;
  last_message_at: string | null;
  admin_read_at: string | null;
}): boolean {
  if (conv.last_message_direction !== "in" || !conv.last_message_at) {
    return false;
  }
  if (!conv.admin_read_at) return true;
  return new Date(conv.last_message_at) > new Date(conv.admin_read_at);
}

function applyFilter(
  conversations: AdminConversation[],
  filter: AdminChatFilter
): AdminConversation[] {
  switch (filter) {
    case "ai":
      return conversations.filter((c) => c.status === "ai_handling");
    case "human":
      return conversations.filter((c) => c.status === "human_handoff");
    case "unread":
      return conversations.filter((c) => c.unread);
    default:
      return conversations;
  }
}

function countFilters(conversations: AdminConversation[]): AdminChatCounts {
  return {
    all: conversations.length,
    ai: conversations.filter((c) => c.status === "ai_handling").length,
    human: conversations.filter((c) => c.status === "human_handoff").length,
    unread: conversations.filter((c) => c.unread).length,
  };
}

async function attachLastMessageMeta(
  conversations: Array<
    WhatsappConversation & {
      admin_read_at?: string | null;
      stores?:
        | { store_name: string | null; shop_domain: string | null }
        | { store_name: string | null; shop_domain: string | null }[]
        | null;
    }
  >
): Promise<AdminConversation[]> {
  if (conversations.length === 0) return [];

  const supabase = createAdminClient();
  const lastMeta = new Map<
    string,
    { direction: "in" | "out"; created_at: string }
  >();

  const ids = conversations.map((c) => c.id);
  const batchSize = 20;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (id) => {
        const { data } = await supabase
          .from("whatsapp_messages")
          .select("direction, created_at")
          .eq("conversation_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          lastMeta.set(id, {
            direction: data.direction as "in" | "out",
            created_at: data.created_at as string,
          });
        }
      })
    );
  }

  return conversations.map((c) => {
    const store = Array.isArray(c.stores) ? c.stores[0] : c.stores;
    const meta = lastMeta.get(c.id) ?? null;
    const admin_read_at = (c.admin_read_at as string | null) ?? null;
    const last_message_at = meta?.created_at ?? null;
    const last_message_direction = meta?.direction ?? null;
    const { stores: _stores, ...rest } = c;

    const unread = isUnread({
      last_message_direction,
      last_message_at,
      admin_read_at,
    });

    return {
      ...rest,
      admin_read_at,
      store_name: store?.store_name ?? null,
      shop_domain: store?.shop_domain ?? null,
      last_message_at,
      last_message_direction,
      unread,
    };
  });
}

export async function getAdminConversations(options: {
  storeId?: string | null;
  filter?: AdminChatFilter;
}): Promise<{
  conversations: AdminConversation[];
  counts: AdminChatCounts;
}> {
  const supabase = createAdminClient();
  const filter = options.filter ?? "all";

  let query = supabase
    .from("whatsapp_conversations")
    .select("*, stores(store_name, shop_domain)")
    .order("updated_at", { ascending: false })
    .limit(250);

  if (options.storeId) {
    query = query.eq("store_id", options.storeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[admin/chats] conversations:", error.message);
    return {
      conversations: [],
      counts: { all: 0, ai: 0, human: 0, unread: 0 },
    };
  }

  const enriched = await attachLastMessageMeta(data ?? []);
  const counts = countFilters(enriched);

  return {
    conversations: applyFilter(enriched, filter),
    counts,
  };
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

/** Mark conversation as read for admin (clears unread). */
export async function markAdminConversationRead(
  conversationId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ admin_read_at: now })
    .eq("id", conversationId);

  if (error) {
    const hint = error.message.includes("admin_read_at")
      ? " — Run migration 018_admin_chat_read.sql in Supabase"
      : "";
    return { error: error.message + hint };
  }

  return { ok: true };
}
