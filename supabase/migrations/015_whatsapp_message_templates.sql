-- WhatsApp HSM message templates (Meta-approved outbound templates)

create table if not exists whatsapp_message_templates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  category text not null default 'UTILITY'
    check (category in ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  language text not null default 'en',
  header_text text,
  body_text text not null,
  footer_text text,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected', 'paused', 'disabled')),
  meta_template_id text,
  meta_status text,
  rejection_reason text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, name, language)
);

create index if not exists idx_wa_templates_store
  on whatsapp_message_templates(store_id, created_at desc);

create index if not exists idx_wa_templates_status
  on whatsapp_message_templates(store_id, status);

alter table whatsapp_message_templates enable row level security;

comment on table whatsapp_message_templates is
  'WhatsApp Business message templates created in-portal and submitted to Meta for approval';
