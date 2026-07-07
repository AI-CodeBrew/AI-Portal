-- Track Shopify sync when portal confirms an order
alter table orders
  add column if not exists shopify_sync_status text
    check (shopify_sync_status in ('synced', 'failed', 'not_applicable')),
  add column if not exists shopify_sync_error text;
