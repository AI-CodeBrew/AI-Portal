-- Order shipment tracking (synced with Shopify fulfillments)

alter table orders
  add column if not exists tracking_number text,
  add column if not exists tracking_company text,
  add column if not exists shopify_fulfillment_id text;

create index if not exists idx_orders_tracking on orders (store_id, tracking_number)
  where tracking_number is not null;
