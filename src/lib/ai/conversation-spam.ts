import { createAdminClient } from "@/lib/supabase/admin";

export type ConversationSpamLimits = {
  replyLimit: number | null;
  windowHours: number | null;
};

export type ConversationSpamState = {
  ai_reply_count?: number | null;
  ai_reply_window_started_at?: string | null;
};

/**
 * Effective AI reply count for spam protection.
 * With a time window: resets to 0 when the window has expired.
 */
export function effectiveAiReplyCount(
  state: ConversationSpamState,
  windowHours: number | null,
  now = Date.now()
): {
  count: number;
  windowExpired: boolean;
  windowStartedAt: string | null;
} {
  const raw = Number(state.ai_reply_count ?? 0);
  if (windowHours == null || windowHours < 1) {
    return {
      count: raw,
      windowExpired: false,
      windowStartedAt: state.ai_reply_window_started_at ?? null,
    };
  }

  const started = state.ai_reply_window_started_at
    ? new Date(state.ai_reply_window_started_at).getTime()
    : null;
  const windowMs = windowHours * 60 * 60 * 1000;
  const expired = started == null || now - started >= windowMs;

  if (expired) {
    return { count: 0, windowExpired: true, windowStartedAt: null };
  }

  return {
    count: raw,
    windowExpired: false,
    windowStartedAt: state.ai_reply_window_started_at ?? null,
  };
}

export function isConversationAiExhausted(
  state: ConversationSpamState,
  limits: ConversationSpamLimits,
  now = Date.now()
): boolean {
  if (limits.replyLimit == null) return false;
  const { count } = effectiveAiReplyCount(state, limits.windowHours, now);
  return count >= limits.replyLimit;
}

/** After a successful AI reply: next count + window start for DB update. */
export function nextAiReplySpamState(
  state: ConversationSpamState,
  limits: ConversationSpamLimits,
  now = new Date()
): {
  ai_reply_count: number;
  ai_reply_window_started_at: string | null;
  exhausted: boolean;
} {
  const nowMs = now.getTime();
  const iso = now.toISOString();

  if (limits.replyLimit == null) {
    const next = Number(state.ai_reply_count ?? 0) + 1;
    return {
      ai_reply_count: next,
      ai_reply_window_started_at: state.ai_reply_window_started_at ?? null,
      exhausted: false,
    };
  }

  if (limits.windowHours == null || limits.windowHours < 1) {
    const next = Number(state.ai_reply_count ?? 0) + 1;
    return {
      ai_reply_count: next,
      ai_reply_window_started_at: state.ai_reply_window_started_at ?? null,
      exhausted: next >= limits.replyLimit,
    };
  }

  const { count, windowExpired } = effectiveAiReplyCount(
    state,
    limits.windowHours,
    nowMs
  );
  const next = windowExpired ? 1 : count + 1;
  const windowStartedAt = windowExpired
    ? iso
    : state.ai_reply_window_started_at ?? iso;

  return {
    ai_reply_count: next,
    ai_reply_window_started_at: windowStartedAt,
    exhausted: next >= limits.replyLimit,
  };
}

export async function getStoreSpamLimits(
  storeId: string
): Promise<ConversationSpamLimits> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("stores")
    .select(
      "ai_conversation_reply_limit, ai_conversation_reply_window_hours"
    )
    .eq("id", storeId)
    .maybeSingle();

  return {
    replyLimit:
      data?.ai_conversation_reply_limit != null
        ? Number(data.ai_conversation_reply_limit)
        : null,
    windowHours:
      data?.ai_conversation_reply_window_hours != null
        ? Number(data.ai_conversation_reply_window_hours)
        : null,
  };
}
