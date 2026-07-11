-- Platform-level Meta / WhatsApp Embedded Signup credentials (singleton).
-- Admin edits via UI; resellers never read the secret.

create table if not exists platform_settings (
  id int primary key default 1 check (id = 1),
  meta_app_id text,
  meta_app_secret text, -- AES-256-GCM encrypted at app layer
  meta_embedded_signup_config_id text,
  whatsapp_verify_token text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table platform_settings is
  'Singleton Meta App credentials for platform Embedded Signup — admin only';

insert into platform_settings (id)
values (1)
on conflict (id) do nothing;

alter table platform_settings enable row level security;

-- Deny all direct client access; server uses service role (bypasses RLS).
drop policy if exists platform_settings_admin_all on platform_settings;
create policy platform_settings_admin_all on platform_settings
  for all
  using (
    exists (
      select 1 from portal_users
      where portal_users.id = auth.uid()
        and portal_users.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from portal_users
      where portal_users.id = auth.uid()
        and portal_users.role = 'admin'
    )
  );

-- Optional display phone for reseller status UI
alter table stores
  add column if not exists whatsapp_display_phone text;
