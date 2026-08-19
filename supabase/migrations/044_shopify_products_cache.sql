-- Cache of Shopify products for fast local reads.
-- Updated via webhook (products/create, products/update, products/delete) and manual sync.

create table if not exists shopify_products_cache (
  id bigint not null,
  store_id uuid not null references stores(id) on delete cascade,
  title text not null default '',
  handle text,
  status text,
  vendor text,
  product_type text,
  description text,
  image_url text,
  price_from text,
  currency text,
  total_inventory int,
  variant_count int not null default 1,
  shopify_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  primary key (store_id, id)
);

create index if not exists idx_shopify_products_cache_store
  on shopify_products_cache (store_id);

create index if not exists idx_shopify_products_cache_title
  on shopify_products_cache using gin (to_tsvector('simple', title));
