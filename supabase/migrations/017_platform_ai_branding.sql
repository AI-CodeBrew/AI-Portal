-- Admin AI defaults: tone + branding (persona UI fields)

alter table platform_ai_defaults
  add column if not exists ai_tone text default 'friendly'
    check (ai_tone is null or ai_tone in ('friendly', 'professional', 'casual', 'formal')),
  add column if not exists platform_name text,
  add column if not exists support_email text,
  add column if not exists support_phone text;

update platform_ai_defaults
set
  ai_tone = coalesce(ai_tone, 'friendly'),
  platform_name = coalesce(platform_name, 'Arabia AI'),
  support_email = coalesce(support_email, 'support@arabia-ai.com'),
  support_phone = coalesce(support_phone, '+971 4 555 0100')
where id = 1;
