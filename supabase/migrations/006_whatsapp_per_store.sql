-- Per-reseller Meta / WhatsApp Cloud API credentials

alter table stores
  add column if not exists meta_app_id text,
  add column if not exists meta_app_secret text,
  add column if not exists meta_config_id text,
  add column if not exists whatsapp_verify_token text;
