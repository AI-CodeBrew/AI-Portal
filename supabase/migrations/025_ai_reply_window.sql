-- Time window for AI replies-per-chat spam protection.
-- NULL window = count AI replies for the whole conversation lifetime (existing behavior).
-- When set (hours), the reply limit applies only within that rolling window.

alter table stores
  add column if not exists ai_conversation_reply_window_hours integer
    check (
      ai_conversation_reply_window_hours is null
      or (ai_conversation_reply_window_hours >= 1 and ai_conversation_reply_window_hours <= 168)
    );

comment on column stores.ai_conversation_reply_window_hours is
  'If set with ai_conversation_reply_limit: max AI replies allowed per conversation within this many hours. NULL = lifetime count.';

alter table whatsapp_conversations
  add column if not exists ai_reply_window_started_at timestamptz;

comment on column whatsapp_conversations.ai_reply_window_started_at is
  'Start of the current AI reply spam-protection window for this conversation.';
