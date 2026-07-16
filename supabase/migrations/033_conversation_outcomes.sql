-- Closed-deal learning loop: outcomes + prompt examples (scoped per store)

alter table whatsapp_conversations
  add column if not exists outcome_extracted boolean not null default false;

comment on column whatsapp_conversations.outcome_extracted is
  'True after a confirmed-order transcript was analyzed into conversation_outcomes.';

create table if not exists conversation_outcomes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  closed boolean not null,
  objection_type text check (
    objection_type is null or objection_type in (
      'price', 'authenticity', 'delivery_time', 'none', 'other'
    )
  ),
  objection_handling_message text,
  messages_to_close int,
  stages_observed text[],
  key_closing_line text,
  customer_tone text check (
    customer_tone is null or customer_tone in (
      'direct', 'hesitant', 'price-sensitive', 'enthusiastic'
    )
  ),
  what_worked text,
  extracted_at timestamptz not null default now(),
  order_id uuid references orders(id) on delete set null
);

create index if not exists idx_conversation_outcomes_store_closed
  on conversation_outcomes (store_id, closed);

create index if not exists idx_conversation_outcomes_objection_type
  on conversation_outcomes (objection_type);

create index if not exists idx_conversation_outcomes_conversation
  on conversation_outcomes (conversation_id);

create table if not exists prompt_examples (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  conversation_id uuid references whatsapp_conversations(id) on delete set null,
  outcome_id uuid references conversation_outcomes(id) on delete set null,
  transcript_snippet text not null,
  objection_type text,
  promoted_at timestamptz not null default now(),
  active boolean not null default true
);

create index if not exists idx_prompt_examples_store_active
  on prompt_examples (store_id, active, promoted_at desc);

alter table conversation_outcomes enable row level security;
alter table prompt_examples enable row level security;

create policy "View conversation outcomes"
  on conversation_outcomes for select
  using (is_admin() or store_id = auth_store_id());

create policy "View prompt examples"
  on prompt_examples for select
  using (is_admin() or store_id = auth_store_id());

create policy "Update prompt examples"
  on prompt_examples for update
  using (is_admin() or store_id = auth_store_id());
