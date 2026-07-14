-- Return / replacement / refund support for WhatsApp AI

alter table stores
  add column if not exists return_policy_days integer not null default 7,
  add column if not exists return_replacement_enabled boolean not null default true,
  add column if not exists return_refund_enabled boolean not null default true,
  add column if not exists return_policy_notes text;

comment on column stores.return_policy_days is
  'Days after order date that damage/wrong-item claims are eligible for auto resolution';
comment on column stores.return_policy_notes is
  'Optional extra return policy text shown to the AI via check_return_policy';

alter table orders
  add column if not exists is_replacement boolean not null default false,
  add column if not exists replacement_for_order_id uuid references orders(id) on delete set null,
  add column if not exists complaint_type text,
  add column if not exists complaint_description text,
  add column if not exists refund_status text not null default 'none'
    check (refund_status in ('none', 'requested', 'approved', 'processed', 'denied')),
  add column if not exists refund_amount numeric;

create index if not exists idx_orders_replacement_for
  on orders (replacement_for_order_id)
  where replacement_for_order_id is not null;
