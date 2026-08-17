-- Track Meta delivery status callbacks (sent/delivered/read/failed) per outbound message
alter table whatsapp_messages
  add column if not exists status text
    check (status in ('sent', 'delivered', 'read', 'failed')),
  add column if not exists status_error_code integer,
  add column if not exists status_error_message text,
  add column if not exists status_updated_at timestamptz;
