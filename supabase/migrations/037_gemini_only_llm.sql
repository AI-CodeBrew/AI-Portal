-- Gemini-only LLM: retire Groq as active provider (columns kept for history; ignored by app)

update platform_settings
set ai_llm_provider = 'gemini'
where ai_llm_provider is distinct from 'gemini';

alter table platform_settings
  alter column ai_llm_provider set default 'gemini';

alter table platform_settings
  drop constraint if exists platform_settings_ai_llm_provider_check;

alter table platform_settings
  add constraint platform_settings_ai_llm_provider_check
  check (ai_llm_provider in ('gemini'));

comment on column platform_settings.ai_llm_provider is
  'WhatsApp sales LLM provider — Gemini only (gemini_api_key column or GEMINI_API_KEY env)';
