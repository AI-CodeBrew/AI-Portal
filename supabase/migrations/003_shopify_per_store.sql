-- Per-reseller Shopify app credentials (each reseller uses their own Shopify app)

alter table stores
  add column if not exists store_name text,
  add column if not exists shopify_api_key text,
  add column if not exists shopify_api_secret text,
  add column if not exists shopify_scopes text default 'read_orders,write_orders,read_products,read_customers,write_draft_orders';
