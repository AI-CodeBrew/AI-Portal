-- Platform LLM provider switch (Groq vs Gemini) + encrypted Gemini key
alter table platform_settings
  add column if not exists ai_llm_provider text not null default 'groq'
    check (ai_llm_provider in ('groq', 'gemini')),
  add column if not exists gemini_api_key text,
  add column if not exists gemini_model text not null default 'gemini-3-flash-preview';

comment on column platform_settings.ai_llm_provider is
  'Active WhatsApp sales LLM: groq (GROQ_API_KEY env) or gemini (gemini_api_key column)';
comment on column platform_settings.gemini_api_key is
  'AES-256-GCM encrypted Google Gemini API key — admin only';
comment on column platform_settings.gemini_model is
  'Gemini model id e.g. gemini-3-flash';
