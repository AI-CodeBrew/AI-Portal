-- Full Shopify catalog cache: variants/images/tags + shop currency.
-- UI and AI read this table; Shopify is only used to sync.

alter table shopify_products_cache
  add column if not exists detail jsonb;

alter table stores
  add column if not exists shopify_currency text,
  add column if not exists shopify_products_synced_at timestamptz,
  add column if not exists shopify_products_sync_started_at timestamptz;

comment on column public.stores.shopify_currency is
  'Currency reported by the connected Shopify shop. Used when stores.currency is unset.';

comment on column public.shopify_products_cache.detail is
  'Full Shopify product payload used by the portal (images, variants, tags).';

create index if not exists idx_shopify_products_cache_status
  on shopify_products_cache (store_id, status);

alter table shopify_products_cache enable row level security;

drop policy if exists "View shopify products cache" on shopify_products_cache;
create policy "View shopify products cache"
  on shopify_products_cache for select
  using (is_admin() or store_id = auth_store_id());

alter table shopify_products_cache replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table shopify_products_cache;
  exception
    when duplicate_object then null;
  end;
end $$;
