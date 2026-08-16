-- Store-wide currency setting (reseller-configured in AI settings). Applies to
-- portal products and Shopify products alike, overriding any per-product
-- currency value. Null means "not configured" — callers fall back to the
-- connected Shopify shop's currency, then to PKR.
alter table public.stores
  add column if not exists currency text;

comment on column public.stores.currency is
  'Reseller-configured store-wide currency code (e.g. PKR, AED, USD). Authoritative for all product pricing and order totals when set.';
