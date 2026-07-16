-- Atomic webhook dedup — one Meta wamid processed once even under race / before migration 028
create table if not exists whatsapp_webhook_dedup (
  wamid text primary key,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_webhook_dedup_created
  on whatsapp_webhook_dedup (created_at);

comment on table whatsapp_webhook_dedup is
  'Meta WhatsApp message ids already handled — prevents duplicate bot replies on webhook retry';
