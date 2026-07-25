-- Admin-selectable Gemini model for intent routing (sales agent uses gemini_model)

alter table platform_settings
  add column if not exists gemini_intent_model text not null default 'gemini-3.5-flash';

comment on column platform_settings.gemini_intent_model is
  'Gemini model id for WhatsApp intent router (ambiguous message classification)';
