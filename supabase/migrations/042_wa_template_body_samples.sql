-- Sample values for {{1}}, {{2}}, ... body variables — required by Meta for
-- template review. Stored as a JSON array of strings, positional (index 0 = {{1}}).
alter table public.whatsapp_message_templates
  add column if not exists body_variable_samples jsonb;

comment on column public.whatsapp_message_templates.body_variable_samples is
  'Positional sample values for body {{n}} variables, sent to Meta as the BODY component''s example.body_text on submit.';
