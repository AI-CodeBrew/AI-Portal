-- Track WhatsApp AI recovery offers on placed orders
alter table orders
  add column if not exists recovery_deal_type text
    check (recovery_deal_type in ('discount', 'bundle')),
  add column if not exists recovery_discount_percent smallint;

comment on column orders.recovery_deal_type is
  'WhatsApp recovery path: discount (Deal 1/2) or bundle (Deal 2/2)';
comment on column orders.recovery_discount_percent is
  'Recovery discount % applied at checkout, if any';
