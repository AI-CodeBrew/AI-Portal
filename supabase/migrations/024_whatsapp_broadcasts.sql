-- WhatsApp broadcast campaigns (Meta template blasts)

create table if not exists whatsapp_broadcasts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  template_id uuid references whatsapp_message_templates(id) on delete set null,
  template_name text not null,
  template_language text not null default 'en',
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'completed', 'failed')),
  total_recipients integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists whatsapp_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references whatsapp_broadcasts(id) on delete cascade,
  phone text not null,
  name text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_broadcasts_store_created
  on whatsapp_broadcasts (store_id, created_at desc);

create index if not exists idx_broadcast_recipients_broadcast
  on whatsapp_broadcast_recipients (broadcast_id, status);

alter table whatsapp_broadcasts enable row level security;
alter table whatsapp_broadcast_recipients enable row level security;
