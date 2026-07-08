-- Per-reseller AI plan and monthly Groq usage tracking

alter table stores
  add column if not exists plan_id text not null default 'basic'
    check (plan_id in ('basic', 'pro', 'max'));

comment on column stores.plan_id is 'AI messaging plan: basic, pro, or max';

create table if not exists store_ai_usage (
  store_id uuid not null references stores(id) on delete cascade,
  period_month text not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (store_id, period_month)
);

create index if not exists idx_store_ai_usage_period
  on store_ai_usage (period_month);

-- Atomic monthly quota check + increment (one AI reply = one request)
create or replace function try_consume_ai_quota(p_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := to_char(timezone('UTC', now()), 'YYYY-MM');
  v_plan text;
  v_limit int;
  v_count int;
begin
  select coalesce(plan_id, 'basic') into v_plan
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
    'period_month', v_period
  );
end;
$$;
