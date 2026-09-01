import { createAdminClient } from "@/lib/supabase/admin";
import type { WhatsappConversation, WhatsappMessage } from "@/lib/types";
import { normalizePhone, toWhatsAppRecipient } from "@/lib/phone";

export type AdminChatFilter = "all" | "ai" | "human" | "unread";

/** Why a conversation matched the search — drives the highlight in the UI. */
export type AdminChatMatchReason = "phone" | "name" | "order" | "message";

export type AdminChatMatch = {
  reason: AdminChatMatchReason;
  /** Set when the conversation is tied to a matched order. */
  orderNumber?: string | null;
  /** Customer name, when that is what matched. */
  customerName?: string | null;
};

export type AdminConversation = WhatsappConversation & {
  store_name: string | null;
  shop_domain: string | null;
  customer_name: string | null;
  admin_read_at: string | null;
  last_message_at: string | null;
  last_message_direction: "in" | "out" | null;
  /** Unread for admin: last message is inbound and newer than admin_read_at. */
  unread: boolean;
  /** Present only when a search is active and this row matched. */
  match: AdminChatMatch | null;
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
      customers?:
        | { name: string | null }
        | { name: string | null }[]
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
    const customer = Array.isArray(c.customers) ? c.customers[0] : c.customers;
    const meta = lastMeta.get(c.id) ?? null;
    const admin_read_at = (c.admin_read_at as string | null) ?? null;
    const last_message_at = meta?.created_at ?? null;
    const last_message_direction = meta?.direction ?? null;
    const { stores: _stores, customers: _customers, ...rest } = c;

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
      customer_name: customer?.name ?? null,
      last_message_at,
      last_message_direction,
      unread,
      match: null,
    };
  });
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `%` and `_` are wildcards in ilike — escape so a literal search stays literal. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Digits only, for phone matching — "+92 300 1234567" and "923001234567" match. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Resolve a free-text search to conversation ids + why each matched.
 *
 * Four sources, in priority order (a conversation keeps its strongest reason):
 *   order   — the query resolves to an order; its customer's chats match
 *   message — the query text appears in a message (catches order numbers the
 *             agent quoted even when the order row is gone)
 *   phone / name — plain contact lookup
 */
async function resolveChatSearch(
  query: string,
  storeId?: string | null
): Promise<Map<string, AdminChatMatch>> {
  const supabase = createAdminClient();
  const raw = query.trim();
  const matches = new Map<string, AdminChatMatch>();
  if (!raw) return matches;

  const like = `%${escapeLike(raw)}%`;
  // Order refs are often typed with a leading # — "#1042" and "1042" are the same.
  const orderRef = raw.replace(/^#/, "").trim();

  // Only overwrite when the new reason outranks the stored one.
  const rank: Record<AdminChatMatchReason, number> = {
    order: 4,
    message: 3,
    name: 2,
    phone: 1,
  };
  const add = (id: string, match: AdminChatMatch) => {
    const existing = matches.get(id);
    if (!existing || rank[match.reason] > rank[existing.reason]) {
      matches.set(id, match);
    }
  };

  // 1. Orders → the customer's conversations
  let orderQuery = supabase
    .from("orders")
    .select("id, order_number, shopify_order_id, customer_id, store_id")
    .limit(50);
  orderQuery = UUID_PATTERN.test(orderRef)
    ? orderQuery.eq("id", orderRef)
    : orderQuery.or(
        `order_number.ilike.${like},shopify_order_id.ilike.${like}`
      );
  if (storeId) orderQuery = orderQuery.eq("store_id", storeId);

  const { data: orders, error: orderErr } = await orderQuery;
  if (orderErr) {
    console.error("[admin/chats] order search:", orderErr.message);
  }

  const customerToOrder = new Map<string, string | null>();
  for (const o of orders ?? []) {
    if (o.customer_id) customerToOrder.set(o.customer_id, o.order_number);
  }

  if (customerToOrder.size > 0) {
    const customerIds = [...customerToOrder.keys()];

    // customer_id on conversations is sparsely populated (most rows predate the
    // link), so resolve the order's customer to a phone and match on that too.
    const { data: orderCustomers } = await supabase
      .from("customers")
      .select("id, phone")
      .in("id", customerIds);

    const phoneToOrder = new Map<string, string | null>();
    for (const cust of orderCustomers ?? []) {
      if (!cust.phone) continue;
      // Stored chat numbers are international digits; order phones are often
      // local ("03…"). Compare on the last 9 digits, which survives both.
      const intl = toWhatsAppRecipient(cust.phone);
      const suffix = normalizePhone(intl).slice(-9);
      if (suffix.length >= 9) {
        phoneToOrder.set(suffix, customerToOrder.get(cust.id) ?? null);
      }
    }

    const orFilters = [
      ...customerIds.map((id) => `customer_id.eq.${id}`),
      ...[...phoneToOrder.keys()]
        .slice(0, 30)
        .map((sfx) => `customer_phone.ilike.%${sfx}%`),
    ];

    if (orFilters.length > 0) {
      const { data: convs } = await supabase
        .from("whatsapp_conversations")
        .select("id, customer_id, customer_phone")
        .or(orFilters.join(","))
        .limit(250);

      for (const c of convs ?? []) {
        const byId = c.customer_id
          ? customerToOrder.get(c.customer_id)
          : undefined;
        const bySuffix = phoneToOrder.get(
          normalizePhone(c.customer_phone ?? "").slice(-9)
        );
        add(c.id, {
          reason: "order",
          orderNumber: byId ?? bySuffix ?? null,
        });
      }
    }
  }

  // 2. Message text (order numbers the agent quoted, or any phrase)
  const { data: msgs, error: msgErr } = await supabase
    .from("whatsapp_messages")
    .select("conversation_id")
    .ilike("content", like)
    .limit(500);
  if (msgErr) {
    console.error("[admin/chats] message search:", msgErr.message);
  }
  for (const m of msgs ?? []) {
    if (m.conversation_id) add(m.conversation_id, { reason: "message" });
  }

  // 3. Customer name
  let nameQuery = supabase
    .from("customers")
    .select("id, name")
    .ilike("name", like)
    .limit(100);
  if (storeId) nameQuery = nameQuery.eq("store_id", storeId);
  const { data: customers } = await nameQuery;

  if (customers?.length) {
    const nameById = new Map(customers.map((c) => [c.id, c.name]));
    const { data: convs } = await supabase
      .from("whatsapp_conversations")
      .select("id, customer_id")
      .in("customer_id", [...nameById.keys()])
      .limit(250);
    for (const c of convs ?? []) {
      add(c.id, {
        reason: "name",
        customerName: c.customer_id ? (nameById.get(c.customer_id) ?? null) : null,
      });
    }
  }

  // 4. Phone — match on digits so formatting differences don't matter.
  // Require the query to be predominantly digits, otherwise stray digits inside
  // an order code ("#PMRI4U95D" → "495") would match unrelated numbers.
  const digits = digitsOnly(raw);
  const mostlyDigits = digits.length >= raw.replace(/[\s+()-]/g, "").length * 0.7;
  if (digits.length >= 5 && mostlyDigits) {
    let phoneQuery = supabase
      .from("whatsapp_conversations")
      .select("id")
      .ilike("customer_phone", `%${escapeLike(digits)}%`)
      .limit(250);
    if (storeId) phoneQuery = phoneQuery.eq("store_id", storeId);
    const { data: convs } = await phoneQuery;
    for (const c of convs ?? []) add(c.id, { reason: "phone" });
  }

  return matches;
}

export async function getAdminConversations(options: {
  storeId?: string | null;
  filter?: AdminChatFilter;
  search?: string | null;
}): Promise<{
  conversations: AdminConversation[];
  counts: AdminChatCounts;
}> {
  const supabase = createAdminClient();
  const filter = options.filter ?? "all";
  const search = options.search?.trim() || "";

  const empty = {
    conversations: [],
    counts: { all: 0, ai: 0, human: 0, unread: 0 },
  };

  let searchMatches: Map<string, AdminChatMatch> | null = null;
  if (search) {
    searchMatches = await resolveChatSearch(search, options.storeId);
    if (searchMatches.size === 0) return empty;
  }

  let query = supabase
    .from("whatsapp_conversations")
    .select("*, stores(store_name, shop_domain), customers(name)")
    .order("updated_at", { ascending: false })
    .limit(250);

  if (options.storeId) {
    query = query.eq("store_id", options.storeId);
  }
  if (searchMatches) {
    query = query.in("id", [...searchMatches.keys()]);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[admin/chats] conversations:", error.message);
    return empty;
  }

  const enriched = (await attachLastMessageMeta(data ?? [])).map((c) =>
    searchMatches ? { ...c, match: searchMatches.get(c.id) ?? null } : c
  );

  // Order matches first — that is what the admin searched for.
  if (searchMatches) {
    enriched.sort(
      (a, b) =>
        Number(b.match?.reason === "order") - Number(a.match?.reason === "order")
    );
  }

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
