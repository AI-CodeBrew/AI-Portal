-- PayTabs payment gateway (per-store) + platform-wide AI defaults

-- PayTabs credentials on stores
alter table stores
  add column if not exists paytabs_profile_id text,
  add column if not exists paytabs_server_key text,
  add column if not exists paytabs_client_key text,
  add column if not exists paytabs_merchant_email text,
  add column if not exists paytabs_region text default 'ARE'
    check (paytabs_region is null or paytabs_region in ('ARE', 'SAU', 'EGY', 'OMN', 'JOR', 'GLOBAL')),
  add column if not exists paytabs_currency text default 'AED',
  add column if not exists paytabs_test_mode boolean not null default true,
  add column if not exists paytabs_connected_at timestamptz;

comment on column stores.paytabs_profile_id is 'PayTabs Profile ID';
comment on column stores.paytabs_server_key is 'Encrypted PayTabs Server Key';
comment on column stores.paytabs_client_key is 'PayTabs Client Key (optional)';
comment on column stores.paytabs_region is 'PayTabs region: ARE, SAU, EGY, OMN, JOR, GLOBAL';

-- Future plan purchase records (API checkout will fill these)
create table if not exists plan_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  plan_id text not null check (plan_id in ('basic', 'pro', 'max')),
  amount numeric not null,
  currency text not null default 'AED',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled')),
  paytabs_tran_ref text,
  paytabs_cart_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_plan_payments_store on plan_payments(store_id, created_at desc);
create index if not exists idx_plan_payments_status on plan_payments(status);

alter table plan_payments enable row level security;

-- Platform-wide AI defaults (single row). Used when a reseller has not set their own values.
create table if not exists platform_ai_defaults (
  id int primary key default 1 check (id = 1),
  ai_agent_name text,
  ai_opening_message text,
  ai_reply_length text not null default 'medium'
    check (ai_reply_length in ('short', 'medium', 'long')),
  ai_order_template_id uuid references ai_prompt_templates(id) on delete set null,
  ai_general_template_id uuid references ai_prompt_templates(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into platform_ai_defaults (
  id,
  ai_agent_name,
  ai_opening_message,
  ai_reply_length,
  ai_order_template_id,
  ai_general_template_id
)
values (
  1,
  'Sales Assistant',
  'Hi! Welcome to {store_name} 👋 I''m {agent_name}. How can I help you today?',
  'medium',
  'a1000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000005'
)
on conflict (id) do nothing;
