-- Auth, roles, and per-reseller store ownership

-- Portal users now link to Supabase Auth
alter table portal_users
  add column if not exists role text default 'reseller'
    check (role in ('admin', 'reseller')),
  add column if not exists full_name text;

-- Stores can be created empty before Shopify connect
alter table stores alter column shop_domain drop not null;
alter table stores alter column shopify_access_token drop not null;

alter table stores
  add column if not exists owner_id uuid references portal_users(id) on delete set null;

-- Drop unique on shop_domain where null (allow multiple unconnected stores)
-- Keep unique only for non-null domains
alter table stores drop constraint if exists stores_shop_domain_key;
create unique index if not exists stores_shop_domain_unique
  on stores (shop_domain) where shop_domain is not null;

-- Auth helpers
create or replace function auth_user_role()
returns text as $$
  select role from portal_users where id = auth.uid()
$$ language sql security definer stable;

create or replace function is_admin()
returns boolean as $$
  select coalesce(
    (select role = 'admin' from portal_users where id = auth.uid()),
    false
  )
$$ language sql security definer stable;

-- Drop old policies and recreate with admin access
drop policy if exists "Merchants can view own store" on stores;
drop policy if exists "Merchants can update own store" on stores;
drop policy if exists "Merchants can view own customers" on customers;
drop policy if exists "Merchants can insert own customers" on customers;
drop policy if exists "Merchants can update own customers" on customers;
drop policy if exists "Merchants can view own orders" on orders;
drop policy if exists "Merchants can insert own orders" on orders;
drop policy if exists "Merchants can update own orders" on orders;
drop policy if exists "Merchants can view own conversations" on whatsapp_conversations;
drop policy if exists "Merchants can update own conversations" on whatsapp_conversations;
drop policy if exists "Merchants can insert own conversations" on whatsapp_conversations;
drop policy if exists "Merchants can view own messages" on whatsapp_messages;
drop policy if exists "Merchants can insert own messages" on whatsapp_messages;
drop policy if exists "Users can read own profile" on portal_users;
drop policy if exists "Users can update own profile" on portal_users;

-- Portal users policies
create policy "Users can read own profile"
  on portal_users for select
  using (id = auth.uid() or is_admin());

create policy "Users can update own profile"
  on portal_users for update
  using (id = auth.uid());

create policy "Admin can view all portal users"
  on portal_users for select
  using (is_admin());

-- Stores
create policy "Resellers can view own store"
  on stores for select
  using (is_admin() or id = auth_store_id() or owner_id = auth.uid());

create policy "Resellers can update own store"
  on stores for update
  using (id = auth_store_id() or owner_id = auth.uid());

create policy "Admin can view all stores"
  on stores for select
  using (is_admin());

-- Customers
create policy "View customers"
  on customers for select
  using (is_admin() or store_id = auth_store_id());

create policy "Insert customers"
  on customers for insert
  with check (is_admin() or store_id = auth_store_id());

create policy "Update customers"
  on customers for update
  using (is_admin() or store_id = auth_store_id());

-- Orders
create policy "View orders"
  on orders for select
  using (is_admin() or store_id = auth_store_id());

create policy "Insert orders"
  on orders for insert
  with check (is_admin() or store_id = auth_store_id());

create policy "Update orders"
  on orders for update
  using (is_admin() or store_id = auth_store_id());

-- Conversations
create policy "View conversations"
  on whatsapp_conversations for select
  using (is_admin() or store_id = auth_store_id());

create policy "Update conversations"
  on whatsapp_conversations for update
  using (is_admin() or store_id = auth_store_id());

create policy "Insert conversations"
  on whatsapp_conversations for insert
  with check (is_admin() or store_id = auth_store_id());

-- Messages
create policy "View messages"
  on whatsapp_messages for select
  using (
    is_admin() or
    conversation_id in (
      select id from whatsapp_conversations where store_id = auth_store_id()
    )
  );

create policy "Insert messages"
  on whatsapp_messages for insert
  with check (
    is_admin() or
    conversation_id in (
      select id from whatsapp_conversations where store_id = auth_store_id()
    )
  );

-- Auto-create reseller profile + store on signup
create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_store_id uuid;
  user_role text;
begin
  user_role := coalesce(new.raw_user_meta_data->>'role', 'reseller');

  if user_role = 'admin' then
    insert into portal_users (id, email, role, full_name)
    values (
      new.id,
      new.email,
      'admin',
      coalesce(new.raw_user_meta_data->>'full_name', '')
    );
  else
    insert into portal_users (id, email, role, full_name)
    values (
      new.id,
      new.email,
      'reseller',
      coalesce(new.raw_user_meta_data->>'full_name', '')
    );

    insert into stores (owner_email, owner_id)
    values (new.email, new.id)
    returning id into new_store_id;

    update portal_users set store_id = new_store_id where id = new.id;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
