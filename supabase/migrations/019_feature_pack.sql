-- Feature pack: AI top-ups, per-conversation AI reply limits, order address,
-- support chat, global product SKUs

-- 1) AI top-up credits (bonus AI requests, usable on any plan including basic)
alter table stores
  add column if not exists ai_topup_credits integer not null default 0
    check (ai_topup_credits >= 0);

comment on column stores.ai_topup_credits is
  'Extra AI message credits purchased via top-up; added to monthly plan limit';

-- Per-conversation AI reply limit (reseller setting). NULL = unlimited.
alter table stores
  add column if not exists ai_conversation_reply_limit integer
    check (ai_conversation_reply_limit is null or ai_conversation_reply_limit >= 1);

comment on column stores.ai_conversation_reply_limit is
  'Max AI outbound replies per conversation before handoff to human. NULL = no limit.';

-- 2) Conversation AI reply tracking + exhausted flag
alter table whatsapp_conversations
  add column if not exists ai_reply_count integer not null default 0
    check (ai_reply_count >= 0),
  add column if not exists ai_exhausted boolean not null default false;

create index if not exists idx_conversations_ai_exhausted
  on whatsapp_conversations (store_id, ai_exhausted)
  where ai_exhausted = true;

-- 3) Order shipping address
alter table orders
  add column if not exists shipping_address jsonb;

comment on column orders.shipping_address is
  'Shipping address JSON: name, phone, address1, address2, city, province, country, zip';

-- 4) AI top-up payment records
create table if not exists ai_topup_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  credits integer not null check (credits > 0),
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

create index if not exists idx_ai_topup_payments_store
  on ai_topup_payments (store_id, created_at desc);

alter table ai_topup_payments enable row level security;

-- 5) Reseller ↔ Admin support chat
create table if not exists support_conversations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  reseller_user_id uuid references portal_users(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'closed')),
  last_message_at timestamptz not null default now(),
  admin_unread boolean not null default false,
  reseller_unread boolean not null default false,
  created_at timestamptz not null default now(),
  unique (store_id)
);

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references support_conversations(id) on delete cascade,
  sender_role text not null check (sender_role in ('admin', 'reseller')),
  sender_user_id uuid references portal_users(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_messages_conv
  on support_messages (conversation_id, created_at);

alter table support_conversations enable row level security;
alter table support_messages enable row level security;

-- 6) Global unique product SKUs (portal catalog)
-- Drop per-store unique if present, add global unique on sku
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'store_products_store_id_sku_key'
  ) then
    alter table store_products drop constraint store_products_store_id_sku_key;
  end if;
exception when undefined_table then
  null;
end $$;

create unique index if not exists idx_store_products_sku_global
  on store_products (lower(sku));

-- Shopify product SKU registry (portal-generated unique SKU per Shopify product)
create table if not exists shopify_product_skus (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  shopify_product_id text not null,
  shopify_variant_id text,
  sku text not null,
  product_title text,
  created_at timestamptz not null default now(),
  unique (store_id, shopify_product_id),
  unique (sku)
);

create index if not exists idx_shopify_product_skus_store
  on shopify_product_skus (store_id);

alter table shopify_product_skus enable row level security;

-- 7) Updated quota RPC: plan limit + topup credits
create or replace function try_consume_ai_quota(p_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := to_char(timezone('UTC', now()), 'YYYY-MM');
  v_plan text;
  v_topup int := 0;
  v_limit int;
  v_count int;
begin
  select coalesce(plan_id, 'basic'), coalesce(ai_topup_credits, 0)
    into v_plan, v_topup
  from stores
  where id = p_store_id;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'store_not_found');
  end if;

  v_limit := case v_plan
    when 'pro' then 2000
    when 'max' then 20000
    else 200
  end;

  v_limit := v_limit + greatest(v_topup, 0);

  insert into store_ai_usage (store_id, period_month, request_count)
  values (p_store_id, v_period, 0)
  on conflict (store_id, period_month) do nothing;

  select request_count into v_count
  from store_ai_usage
  where store_id = p_store_id and period_month = v_period
  for update;

  if v_count >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'plan_id', v_plan,
      'limit', v_limit,
      'used', v_count,
      'topup', v_topup,
      'period_month', v_period,
      'reason', 'quota_exceeded'
    );
  end if;

  update store_ai_usage
  set request_count = request_count + 1,
      updated_at = timezone('UTC', now())
  where store_id = p_store_id and period_month = v_period
  returning request_count into v_count;

  return jsonb_build_object(
    'allowed', true,
    'plan_id', v_plan,
    'limit', v_limit,
    'used', v_count,
    'topup', v_topup,
    'period_month', v_period
  );
end;
$$;

-- Apply top-up credits after payment (admin/manual or callback)
create or replace function apply_ai_topup_credits(p_store_id uuid, p_credits int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_credits is null or p_credits <= 0 then
    return;
  end if;
  update stores
  set ai_topup_credits = coalesce(ai_topup_credits, 0) + p_credits
  where id = p_store_id;
end;
$$;
