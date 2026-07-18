alter table whatsapp_message_templates
  add column if not exists header_example_image_url text;

comment on column whatsapp_message_templates.header_example_image_url is
  'Public HTTPS sample image URL uploaded to Meta when submitting IMAGE header templates';
