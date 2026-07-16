-- Encrypted Groq API key + model in admin (optional override for GROQ_API_KEY env)
alter table platform_settings
  add column if not exists groq_api_key text,
  add column if not exists groq_model text not null default 'llama-3.3-70b-versatile';

comment on column platform_settings.groq_api_key is
  'AES-256-GCM encrypted Groq API key — admin panel; falls back to GROQ_API_KEY env';
comment on column platform_settings.groq_model is
  'Groq model id e.g. llama-3.3-70b-versatile';
