-- Link an order to the WhatsApp chat it was created from.
--
-- Orders are keyed to a customer row upserted on the phone the customer typed
-- at checkout, which is frequently NOT the number they are chatting from. That
-- left no reliable path from a conversation back to its order, so order
-- templates rendered their placeholder defaults ("your order", 0.00).

alter table orders
  add column if not exists conversation_id uuid
    references whatsapp_conversations(id) on delete set null;

comment on column orders.conversation_id is
  'WhatsApp chat this order was created from. Set at creation; the customer_id link is unreliable because checkout phone != chat phone.';

create index if not exists idx_orders_conversation
  on orders (conversation_id, created_at desc);
