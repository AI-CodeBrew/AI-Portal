-- Dedupe Meta WhatsApp webhook retries (same wamid delivered twice)
alter table whatsapp_messages
  add column if not exists meta_message_id text;

create unique index if not exists idx_whatsapp_messages_meta_id
  on whatsapp_messages (meta_message_id)
  where meta_message_id is not null;
