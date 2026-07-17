-- Store plans v2: basic, growth, pro, enterprise (replaces max)

update stores set plan_id = 'enterprise' where plan_id = 'max';

alter table stores drop constraint if exists stores_plan_id_check;

alter table stores
  add constraint stores_plan_id_check
  check (plan_id in ('basic', 'growth', 'pro', 'enterprise'));

comment on column stores.plan_id is
  'Reseller plan: basic (free), growth, pro, enterprise';

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

  if v_plan = 'max' then
    v_plan := 'enterprise';
  end if;

  v_limit := case v_plan
    when 'growth' then 1000
    when 'pro' then 5000
    when 'enterprise' then 50000
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
