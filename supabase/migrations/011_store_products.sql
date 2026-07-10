-- Portal product catalog for resellers (with variants, bundles, discounts)
-- Ad links can point at portal products via SKU / slug for AI recognition

create table if not exists store_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  tagline text,
  description text,
  image_url text,
  price numeric(12, 2) not null default 0,
  currency text not null default 'AED',
  target_country text not null default 'UAE',
  sku text not null,
  discount_enabled boolean not null default false,
  discount_type text check (discount_type is null or discount_type in ('percent', 'fixed')),
  discount_value numeric(12, 2),
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, sku)
);

create index if not exists idx_store_products_store
  on store_products (store_id, created_at desc);

create index if not exists idx_store_products_sku
  on store_products (store_id, sku);

create table if not exists store_product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references store_products(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  values text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_store_product_options_product
  on store_product_options (product_id, sort_order);

create table if not exists store_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references store_products(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  title text not null,
  sku text,
  price numeric(12, 2),
  option_values jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_store_product_variants_product
  on store_product_variants (product_id, sort_order);

create table if not exists store_product_bundles (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references store_products(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  quantity int not null check (quantity > 0),
  price numeric(12, 2) not null check (price >= 0),
  label text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_store_product_bundles_product
  on store_product_bundles (product_id, sort_order);

-- Extend ad links for portal products (SKU used as slug for AI)
alter table ad_whatsapp_links
  alter column shopify_product_id drop not null;

alter table ad_whatsapp_links
  add column if not exists portal_product_id uuid references store_products(id) on delete set null;

alter table ad_whatsapp_links
  add column if not exists portal_variant_id uuid references store_product_variants(id) on delete set null;

alter table ad_whatsapp_links
  add column if not exists product_sku text;

alter table ad_whatsapp_links
  add column if not exists image_url text;

create index if not exists idx_ad_whatsapp_links_portal_product
  on ad_whatsapp_links (portal_product_id);

create index if not exists idx_ad_whatsapp_links_sku
  on ad_whatsapp_links (store_id, product_sku);
