-- Selected Meta-approved WhatsApp template for order confirmation messages
alter table stores
  add column if not exists whatsapp_order_template_id uuid
    references whatsapp_message_templates(id) on delete set null;

comment on column stores.whatsapp_order_template_id is
  'Meta-approved WhatsApp template used when confirming orders';
