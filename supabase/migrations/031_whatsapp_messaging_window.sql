-- WhatsApp 24h service / 72h Click-to-WhatsApp messaging window tracking.
-- Time remaining is derived at read time from last_customer_message_at + window_type.

alter table whatsapp_conversations
  add column if not exists last_customer_message_at timestamptz,
  add column if not exists window_type text not null default 'service'
    check (window_type in ('service', 'free_entry_point')),
  add column if not exists marketing_opt_in boolean not null default false;

comment on column whatsapp_conversations.last_customer_message_at is
  'Timestamp of the customer''s last inbound WhatsApp message; resets the messaging window.';

comment on column whatsapp_conversations.window_type is
  'service = 24h window after last inbound; free_entry_point = 72h after CTWA ad referral.';

comment on column whatsapp_conversations.marketing_opt_in is
  'Recorded marketing consent for this chat; required before sending Marketing templates.';

create index if not exists idx_whatsapp_conversations_last_customer_message_at
  on whatsapp_conversations (store_id, last_customer_message_at desc nulls last);

-- Backfill from latest inbound message for existing chats
update whatsapp_conversations c
set last_customer_message_at = sub.last_in
from (
  select conversation_id, max(created_at) as last_in
  from whatsapp_messages
  where direction = 'in'
  group by conversation_id
) sub
where c.id = sub.conversation_id
  and c.last_customer_message_at is null;
