-- Reseller can disable WhatsApp opening message (admin default won't send either)
alter table public.stores
  add column if not exists ai_send_opening_message boolean not null default true;

comment on column public.stores.ai_send_opening_message is
  'When false, no automated opening message is sent to new conversations (platform default is ignored).';
