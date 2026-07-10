-- Move PayTabs to platform-level (admin configures once; resellers only checkout)

create table if not exists platform_paytabs_settings (
  id int primary key default 1 check (id = 1),
  profile_id text,
  server_key text,
  client_key text,
  merchant_email text,
  region text not null default 'ARE'
    check (region in ('ARE', 'SAU', 'EGY', 'OMN', 'JOR', 'GLOBAL')),
  currency text not null default 'AED',
  test_mode boolean not null default true,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table platform_paytabs_settings is
  'Platform PayTabs merchant credentials — configured by admin, used for reseller plan checkouts';

insert into platform_paytabs_settings (id)
values (1)
on conflict (id) do nothing;

-- Ensure plan_payments exists (from 013) for reseller checkout records
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
