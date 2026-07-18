-- Rich WhatsApp templates: dynamic image header + URL button for product follow-ups

alter table whatsapp_message_templates
  add column if not exists header_format text
    check (header_format is null or header_format in ('TEXT', 'IMAGE')),
  add column if not exists header_image_variable boolean not null default false,
  add column if not exists button_type text not null default 'NONE'
    check (button_type in ('NONE', 'URL')),
  add column if not exists button_text text,
  add column if not exists button_url_pattern text;

comment on column whatsapp_message_templates.header_format is
  'TEXT = static header text; IMAGE = dynamic product image per send';
comment on column whatsapp_message_templates.button_url_pattern is
  'Meta URL button pattern with {{1}} suffix, e.g. https://shop.com/products/{{1}}';
