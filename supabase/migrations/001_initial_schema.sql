-- Multi-merchant e-commerce portal schema

create extension if not exists "pgcrypto";

-- Portal users (merchants) linked to their store
create table portal_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  store_id uuid,
  created_at timestamptz default now()
);

create table stores (
  id uuid primary key default gen_random_uuid(),
  shop_domain text unique not null,
  shopify_access_token text not null,
  whatsapp_phone_number_id text,
  whatsapp_access_token text,
  whatsapp_waba_id text,
  owner_email text,
  created_at timestamptz default now()
);

alter table portal_users
  add constraint portal_users_store_id_fkey
  foreign key (store_id) references stores(id) on delete set null;

create table customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  phone text not null,
  name text,
  shopify_customer_id text,
  created_at timestamptz default now(),
  unique(store_id, phone)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  shopify_order_id text,
  shopify_draft_order_id text,
  order_number text,
  items jsonb not null default '[]'::jsonb,
  total numeric,
  status text default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  source text default 'shopify' check (source in ('shopify', 'whatsapp_ai')),
  confirmed_by text,
  confirmed_at timestamptz,
  created_at timestamptz default now()
);

create table whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  customer_phone text not null,
  status text default 'ai_handling' check (status in ('ai_handling', 'human_handoff', 'closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references whatsapp_conversations(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  content text not null,
  created_at timestamptz default now()
);

-- Indexes
create index idx_orders_store_status on orders(store_id, status);
create index idx_orders_created_at on orders(created_at desc);
create index idx_conversations_store_status on whatsapp_conversations(store_id, status);
create index idx_messages_conversation on whatsapp_messages(conversation_id, created_at);

-- Updated_at trigger for conversations
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger whatsapp_conversations_updated_at
  before update on whatsapp_conversations
  for each row execute function update_updated_at();

-- Row Level Security
alter table portal_users enable row level security;
alter table stores enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table whatsapp_conversations enable row level security;
alter table whatsapp_messages enable row level security;

-- Helper: get store_id for authenticated user
create or replace function auth_store_id()
returns uuid as $$
  select store_id from portal_users where id = auth.uid()
$$ language sql security definer stable;

-- Portal users: can read own row
create policy "Users can read own profile"
  on portal_users for select
  using (id = auth.uid());

create policy "Users can update own profile"
  on portal_users for update
  using (id = auth.uid());

-- Stores: merchants see only their store
create policy "Merchants can view own store"
  on stores for select
  using (id = auth_store_id());

create policy "Merchants can update own store"
  on stores for update
  using (id = auth_store_id());

-- Customers
create policy "Merchants can view own customers"
  on customers for select
  using (store_id = auth_store_id());

create policy "Merchants can insert own customers"
  on customers for insert
  with check (store_id = auth_store_id());

create policy "Merchants can update own customers"
  on customers for update
  using (store_id = auth_store_id());

-- Orders
create policy "Merchants can view own orders"
  on orders for select
  using (store_id = auth_store_id());

create policy "Merchants can insert own orders"
  on orders for insert
  with check (store_id = auth_store_id());

create policy "Merchants can update own orders"
  on orders for update
  using (store_id = auth_store_id());

-- Conversations
create policy "Merchants can view own conversations"
  on whatsapp_conversations for select
  using (store_id = auth_store_id());

create policy "Merchants can update own conversations"
  on whatsapp_conversations for update
  using (store_id = auth_store_id());

create policy "Merchants can insert own conversations"
  on whatsapp_conversations for insert
  with check (store_id = auth_store_id());

-- Messages (via conversation store_id)
create policy "Merchants can view own messages"
  on whatsapp_messages for select
  using (
    conversation_id in (
      select id from whatsapp_conversations where store_id = auth_store_id()
    )
  );

create policy "Merchants can insert own messages"
  on whatsapp_messages for insert
  with check (
    conversation_id in (
      select id from whatsapp_conversations where store_id = auth_store_id()
    )
  );

-- Enable Realtime for orders and conversations
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table whatsapp_conversations;
alter publication supabase_realtime add table whatsapp_messages;
