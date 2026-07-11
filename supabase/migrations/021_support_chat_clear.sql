-- Per-side clear for support chats. Conversation hard-deleted when both sides clear.

alter table support_conversations
  add column if not exists admin_cleared_at timestamptz,
  add column if not exists reseller_cleared_at timestamptz;

comment on column support_conversations.admin_cleared_at is
  'Admin cleared chat from their view; messages before this are hidden for admin';
comment on column support_conversations.reseller_cleared_at is
  'Reseller cleared chat from their view; messages before this are hidden for reseller';
