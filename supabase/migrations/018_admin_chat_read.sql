-- Admin chat unread: track when an admin last opened a conversation

alter table whatsapp_conversations
  add column if not exists admin_read_at timestamptz;

comment on column whatsapp_conversations.admin_read_at is
  'When an admin last opened this chat in All Chats. Unread if last inbound message is newer.';
