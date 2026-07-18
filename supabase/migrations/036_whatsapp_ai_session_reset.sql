-- When a reseller clears/deletes an inbox chat, the next WhatsApp thread for that
-- customer should start a fresh AI session (no prior message context).

create table if not exists whatsapp_ai_session_resets (
  store_id uuid not null references stores(id) on delete cascade,
  customer_phone text not null,
  reset_at timestamptz not null default now(),
  primary key (store_id, customer_phone)
);

comment on table whatsapp_ai_session_resets is
  'Reseller cleared the inbox chat — AI ignores pre-reset context for this customer.';

create index if not exists idx_whatsapp_ai_session_resets_reset_at
  on whatsapp_ai_session_resets (store_id, reset_at desc);
