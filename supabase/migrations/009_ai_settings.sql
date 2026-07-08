-- Per-store AI agent settings and prompt templates

alter table stores
  add column if not exists ai_agent_name text,
  add column if not exists ai_opening_message text,
  add column if not exists ai_reply_length text not null default 'medium'
    check (ai_reply_length in ('short', 'medium', 'long')),
  add column if not exists ai_order_template_id uuid,
  add column if not exists ai_general_template_id uuid;

create table if not exists ai_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  slug text,
  category text not null check (category in ('order_creation', 'general', 'product_inquiry', 'support')),
  name text not null,
  description text,
  prompt_content text not null,
  created_at timestamptz not null default now(),
  constraint ai_prompt_templates_slug_unique unique (slug)
);

create index if not exists idx_ai_prompt_templates_store
  on ai_prompt_templates (store_id)
  where store_id is not null;

alter table stores
  drop constraint if exists stores_ai_order_template_id_fkey;

alter table stores
  add constraint stores_ai_order_template_id_fkey
  foreign key (ai_order_template_id) references ai_prompt_templates(id) on delete set null;

-- Platform predefined templates (store_id is null)
insert into ai_prompt_templates (id, store_id, slug, category, name, description, prompt_content)
values
  (
    'a1000001-0001-4000-8000-000000000001',
    null,
    'standard-order',
    'order_creation',
    'Standard order flow',
    'Confirm items and quantity, collect customer name, then create the draft order.',
    'When the customer wants to buy:
- Confirm each item, variant (size/color), and quantity before ordering.
- Ask for their full name if you do not have it.
- Summarize the order total using price_formatted from tools.
- Use create_draft_order only after the customer confirms.
- Tell them the order number and that the team will confirm it shortly.'
  ),
  (
    'a1000001-0001-4000-8000-000000000002',
    null,
    'quick-checkout',
    'order_creation',
    'Quick checkout',
    'Minimal back-and-forth — move fast when the customer is ready to buy.',
    'When the customer wants to buy:
- If product and quantity are clear, create the draft order quickly.
- Ask only one clarifying question if needed (e.g. size).
- Keep messages short and action-oriented.
- After create_draft_order, give the order number and next steps in one message.'
  ),
  (
    'a1000001-0001-4000-8000-000000000003',
    null,
    'consultative-sales',
    'order_creation',
    'Consultative sales',
    'Recommend options, suggest add-ons, then close the order.',
    'When the customer wants to buy:
- Suggest complementary products when relevant (one at a time).
- Explain why a variant fits their need before adding to the order.
- Confirm the full cart and total before create_draft_order.
- Be helpful, not pushy — accept "no thanks" gracefully.'
  ),
  (
    'a1000001-0001-4000-8000-000000000004',
    null,
    'friendly-general',
    'general',
    'Friendly & warm',
    'Warm, welcoming tone for all conversations.',
    'Tone guidelines:
- Greet customers warmly and use their name when you know it.
- Use light, positive language suitable for WhatsApp.
- End messages with a helpful question when appropriate.'
  ),
  (
    'a1000001-0001-4000-8000-000000000005',
    null,
    'professional-general',
    'general',
    'Professional & concise',
    'Clear, business-like replies without being cold.',
    'Tone guidelines:
- Be polite and direct. Avoid slang and excessive emojis.
- Lead with the answer, then offer next steps.
- Stay focused on products, orders, and store policies.'
  )
on conflict (slug) do nothing;

alter table stores
  drop constraint if exists stores_ai_general_template_id_fkey;

alter table stores
  add constraint stores_ai_general_template_id_fkey
  foreign key (ai_general_template_id) references ai_prompt_templates(id) on delete set null;

-- Default selected template for existing stores
update stores
set
  ai_order_template_id = coalesce(
    ai_order_template_id,
    'a1000001-0001-4000-8000-000000000001'::uuid
  ),
  ai_general_template_id = coalesce(
    ai_general_template_id,
    'a1000001-0001-4000-8000-000000000005'::uuid
  )
where ai_order_template_id is null or ai_general_template_id is null;
