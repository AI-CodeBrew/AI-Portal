-- Auto-confirm orders + dual AI instruction tracks (WhatsApp sales vs Shopify confirmation)

alter table stores
  add column if not exists auto_confirm_orders boolean not null default false,
  add column if not exists auto_follow_up_template_id uuid
    references whatsapp_message_templates(id) on delete set null,
  add column if not exists whatsapp_sales_instructions text,
  add column if not exists shopify_confirm_instructions text;

comment on column stores.auto_confirm_orders is
  'When true, new Shopify orders are auto-confirmed and customer is notified';
comment on column stores.auto_follow_up_template_id is
  'Approved WA template sent after auto-confirm (optional)';
comment on column stores.whatsapp_sales_instructions is
  'Extra instructions for WhatsApp lead / sales-agent mode';
comment on column stores.shopify_confirm_instructions is
  'Extra instructions when AI handles Shopify order confirmation chats';

-- Expand AI template categories for dual agent modes
alter table ai_prompt_templates
  drop constraint if exists ai_prompt_templates_category_check;

alter table ai_prompt_templates
  add constraint ai_prompt_templates_category_check
  check (category in (
    'order_creation',
    'general',
    'product_inquiry',
    'support',
    'whatsapp_sales',
    'shopify_confirmation'
  ));

-- Seed default instruction presets (platform-wide)
insert into ai_prompt_templates (id, store_id, slug, category, name, description, prompt_content)
values
  (
    'a1000001-0001-4000-8000-000000000011',
    null,
    'wa-sales-default',
    'whatsapp_sales',
    'WhatsApp sales agent (default)',
    'Full sales flow for WhatsApp leads — discover needs, recommend, close the order.',
    'You are a WhatsApp sales agent for this store.
- Greet warmly and understand what the customer wants.
- Search/recommend products, share prices clearly, answer objections.
- Guide them to buy: confirm item, quantity, name, then create_draft_order.
- Do not invent stock or prices — use tools.
- Keep replies short and suitable for WhatsApp.'
  ),
  (
    'a1000001-0001-4000-8000-000000000012',
    null,
    'wa-sales-consultative',
    'whatsapp_sales',
    'Consultative WhatsApp sales',
    'Recommend options and add-ons before closing.',
    'You are a consultative WhatsApp sales agent.
- Ask 1–2 clarifying questions before recommending.
- Suggest complementary products when relevant (one at a time).
- Confirm the full cart and total before create_draft_order.
- Be helpful, not pushy.'
  ),
  (
    'a1000001-0001-4000-8000-000000000013',
    null,
    'shopify-confirm-default',
    'shopify_confirmation',
    'Shopify confirmation agent (default)',
    'Handle customers who already ordered on Shopify — confirm details, address, dispatch.',
    'You are an order confirmation agent for Shopify orders (not a sales agent).
- Customers already placed an order on the online store.
- Help them confirm order details, shipping address, and expected delivery.
- If they ask to cancel or change items, collect the request and escalate_to_human.
- Share tracking when available; do not push new product sales unless they ask.
- Keep replies clear and reassuring.'
  ),
  (
    'a1000001-0001-4000-8000-000000000014',
    null,
    'shopify-confirm-dispatch',
    'shopify_confirmation',
    'Dispatch & tracking focus',
    'Focus on dispatch status and tracking updates.',
    'You handle Shopify order status chats.
- Prioritize order number, dispatch status, and tracking.
- If tracking is missing, say the team will update them soon and escalate_to_human if urgent.
- Do not create new draft orders unless the customer explicitly wants a new purchase.
- Be brief and accurate.'
  )
on conflict (slug) do nothing;

-- Default free-text instructions on platform (copied to stores when empty via app)
-- No column on platform_ai_defaults required; app uses seeded template prompts as defaults.
