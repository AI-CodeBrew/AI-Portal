-- WhatsApp ad links: product-specific click-to-chat links for Meta ads

create table if not exists ad_whatsapp_links (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  slug text not null,
  shopify_product_id text not null,
  shopify_variant_id text,
  product_title text not null,
  product_description text,
  variant_title text,
  price text,
  currency text,
  prefill_message text not null,
  click_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (store_id, slug)
);

create index if not exists idx_ad_whatsapp_links_store
  on ad_whatsapp_links (store_id, created_at desc);

create index if not exists idx_ad_whatsapp_links_slug
  on ad_whatsapp_links (slug);

alter table whatsapp_conversations
  add column if not exists ad_link_id uuid references ad_whatsapp_links(id) on delete set null;
