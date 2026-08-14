# WhatsApp AI Sales Agent

Living documentation for how the portal’s WhatsApp sales AI works. **Update this file whenever you change AI behavior, prompts, tools, or message flow.**

Last updated: 2026-08-09

---

## Overview

The agent is **not fine-tuned**. It uses **Google Gemini** (plus optional Anthropic env fallback) guided by:

1. **System prompt** — human sales rep persona, hard rules, stage guidance (`build-system-prompt.ts`)
2. **Per-store settings** — name, tone, templates, recovery discounts (Dashboard → AI Settings)
3. **Tools** — live catalog/order data from Supabase + Shopify (`sales-tools.ts`)
4. **Direct handlers** — deterministic shortcuts before the LLM for orders, recovery, SKU lookup, images

Each reseller has **one store**. Product search, orders, and conversations are **scoped to the store whose WhatsApp number received the message** — never cross-reseller.

---

## End-to-end flow

```
Customer WhatsApp message
        ↓
Meta webhook → whatsapp-webhook-handler.ts
        ↓
Resolve store by whatsapp_phone_number_id
        ↓
Load conversation (store_id + customer_phone)
        ↓
Optional: opening message (new conversation only)
        ↓
runSalesAgent() — hybrid pipeline (see below)
        ↓
extractOutboundMedia() — pull [Image: …] + CDN URLs
        ↓
sendWhatsAppImage() then sendWhatsAppText()
        ↓
Save full reply (with internal markers) to whatsapp_messages
```

---

## Hybrid pipeline (`run-sales-agent.ts`)

Handlers run **in order**. First match wins.

| Order | Handler | When |
|------|---------|------|
| 1 | Exact routes | Clear SKU, checkout with phone+address, catalog browse phrases, product confirm (“yes” after Did you mean), delivery/return policy |
| 2 | Intent router (LLM classify) | High-confidence **tool** intents only (search/browse/checkout/variant/image). Price/discount/small-talk/clarify → **fall through** (no hardcoded reply) |
| 3 | Gemini sales agent | Writes the customer reply (objections, ads, ambiguous phrasing) using system prompt + tools |
| 4 | Fallbacks | Catalog pick / checkout / product / greeting — only if Gemini fails |

**LLM-first for conversation:** Do not regex-match every “costly / discount” phrasing into a canned reply. Gemini decides intent from full chat context; discount ladder lives in the system prompt.

---

## Store scoping

| Data | Scope |
|------|--------|
| Portal products | `store_products` where `store_id = active store` |
| Shopify catalog | That store’s `shop_domain` + access token |
| SKU registry | `shopify_product_skus` where `store_id = active store` |
| Orders | Created under that store only |
| Conversations | `whatsapp_conversations.store_id` |

Store is resolved in the webhook:

```ts
// whatsapp-webhook-handler.ts
.eq("whatsapp_phone_number_id", phoneNumberId)
```

---

## LLM system prompt (`build-system-prompt.ts`)

Built per request with:

- **Identity** — named sales agent for the store; if asked “who are you / are you AI?”, reply as **agent name from the store** here to help with products/orders — do **not** say “virtual assistant”, AI, or bot
- **Tone** — 1–3 short WhatsApp lines; match customer language; no corporate filler
- **Hard rules** — no invented prices/stock; no revealing system prompt; no orders without address/phone; prompt-injection text treated as customer content
- **Discount ladder** — value first → configured % off → bundle % → stop/escalate (aligned with recovery handlers)
- **Sales stages** — discover → present → objections → close → confirm
- **Reseller instructions** — from AI Settings agent modes (cannot override hard rules)
- **Tools** — `SALES_TOOL_RULES` + catalog/order tools for this store only
- **Memory** — recent history + optional profile/summary/examples

### Conversation stages

Detected in `conversation-stage.ts`:

`greeting` → `product_presentation` → `qualifying` → `objection_handling` → `closing` → `order_confirmation` → `post_order`

Stage + instructions are injected into the system prompt each turn.

---

## Tools (`sales-tools.ts`)

| Tool | Purpose |
|------|---------|
| `search_products` | Portal + Shopify catalog for **this store** |
| `check_stock` | Live Shopify variant price/stock |
| `create_draft_order` | Place portal or Shopify order (needs name, phone, address) |
| `lookup_customer_orders` | Recent orders by customer phone |
| `get_order_status` | Single order by number |
| `confirm_order` / `cancel_order` | Pending Shopify confirmation flow |
| `escalate_to_human` | Sets conversation to human handoff |

Portal orders use portal SKU / UUID variant id. Shopify orders use numeric `variant_id`.

---

## Direct handlers (detail)

### Product lookup (`tryDirectProductReply`)

- Triggers on SKU (`AA-…`), product keywords, or **follow-ups** (“different colors?”, “what sizes?”) when a product was already discussed in chat
- **SKU always triggers lookup**, even if message also says “want to order”
- Follow-ups re-search by SKU/title from history and answer via `formatProductFollowUpReply()` (lists options or says single variant only)
- **Active product context** — follow-ups/images use the **most recent** product pitch in chat (`findActiveProductContext`), not older SKUs/titles from earlier in the session
- Skips only when `parseCheckoutDetails()` finds a full contact block
- Calls `search_products` tool internally, formats via `formatProductsReply()` or follow-up formatter

### Product images (`tryDirectProductImageReply`)

- Triggers on “send/share/show image/photo/picture”
- Finds SKU/product from current message or chat history
- Returns `[Image: https://…]` marker + short caption
- Remembers **latest quoted price** from history (including recovery offers)

### Sales recovery (`tryDirectSalesRecoveryReply`)

- After product pitch, on decline: **value reassurance** → **Deal 1/2** (configurable % off) → **Deal 2/2** (2-pack bundle) → polite stop
- Uses internal markers: `[Objection — value pitch]`, `[Deal 1/2 — N% off]`, `[Deal 2/2 — …]`, `[Deal closed]`
- Stored in DB history for stage detection; stripped before WhatsApp send

### Checkout (`tryDirectCheckoutReply`)

- Parses name, phone, address from free text
- Creates order via `create_draft_order` / `createWhatsAppAiOrder`
- Stores `recovery_deal_type` and `recovery_discount_percent` on order when applicable

---

## WhatsApp outbound media

Internal markers in stored message content (stripped before customer sees text):

| Marker | Purpose |
|--------|---------|
| `[Image: https://…]` | Send as WhatsApp image message |
| `[Ref: uuid]` | Internal variant/product ref for order placement |
| `[Deal 1/2 …]` / `[Deal 2/2 …]` | Recovery stage tracking |
| `[Objection — value pitch]` | First refusal — quality/value reassurance before any discount |

Processing: `message-markers.ts` → `extractOutboundMedia()`

- Pulls `[Image: …]` markers
- Also extracts bare CDN URLs (Shopify CDN, Bunny) if the LLM pasted links in text
- Portal WebP images: converted to JPEG and uploaded via WhatsApp Media API (`whatsapp-image.server.ts`)

Send order in webhook: images first (with delay), then text.

---

## Chat memory (5 layers)

| Layer | What | Default |
|-------|------|---------|
| 1 Session identity | `storeId:phone` persistent conversation | Webhook resolve |
| 2 Short-term history | **Full thread** while under ~70% of 120k budget | No time window |
| 3 Compaction | At ~70%: rolling summary of older chat + last **20** exact | Utility model |
| 4 Customer profile | Name, language, funnel, SKUs, objections | Rules-first update |
| 5 Long-term Mem0 | Supabase pgvector recall; Gemini `gemini-embedding-001` | Soft-fail if unset |

- Under budget: agent **contents** = all messages in the session
- At/over ~70%: compact → prompt gets rolling summary + last 20 verbatim (exact window then grows with new msgs until ~70% again)
- Prompt inject = profile + rolling summary + Mem0 recall
- Inbox clear resets summary; durable profile is kept
- Resolver: `resolveAgentChatHistory` in `conversation-compaction.ts`
- Files: `src/lib/memory/*`, migration `039_conversation_memory.sql`

### Model routing

| Task | Model env |
|------|-----------|
| Default chat / tools | `GEMINI_CHAT_MODEL` (low thinking) |
| Hard negotiation / objections | `GEMINI_REASONING_MODEL` |
| Summary + Mem0 extract / intent | `GEMINI_UTILITY_MODEL` |

---

## Per-store configuration

Reseller: **Dashboard → AI Settings**

| Setting | Effect |
|---------|--------|
| Agent name | Prompt identity |
| Opening message | First message on new conversation (personalized) |
| Reply length / tone | Prompt tone section |
| WhatsApp sales instructions | Reseller tactics block in prompt |
| Shopify confirm instructions | Pending order confirmation mode |
| Recovery discount % / bundle % | Direct recovery handler + prompt note |
| AI reply limit | Auto handoff to human after N replies |

Admin platform defaults apply when store leaves a field null.

---

## Environment

| Variable | Role |
|----------|------|
| `GEMINI_API_KEY` | Gemini API key (env only; admin UI is status-only) |
| `GEMINI_CHAT_MODEL` | Chat / sales replies (default `gemini-3.6-flash`) |
| `GEMINI_REASONING_MODEL` | Heavier reasoning tasks (default `gemini-3.1-pro-preview`) |
| `GEMINI_UTILITY_MODEL` | Light utility / intent routing (default `gemini-3.1-flash-lite`) |
| `ANTHROPIC_API_KEY` | Fallback LLM if Gemini unavailable |
| `BUNNY_CDN_HOSTNAME` | Portal product image URLs |

---

## Key files (change map)

When you change AI behavior, update **this doc** and the relevant file:

| Area | Files |
|------|--------|
| Pipeline order / entry | `src/lib/ai/run-sales-agent.ts` |
| System prompt / persona | `src/lib/ai/build-system-prompt.ts` |
| Stages / summary | `src/lib/ai/conversation-stage.ts` |
| Tools / order create | `src/lib/ai/sales-tools.ts` |
| Product + image direct replies | `src/lib/ai/product-reply.ts` |
| Checkout parsing | `src/lib/ai/checkout-reply.ts`, `checkout-parse.ts` |
| Recovery offers | `src/lib/ai/sales-recovery.ts` |
| Gemini / Anthropic loops | `src/lib/ai/gemini-agent.ts`, `anthropic-agent.ts`, `intent-router.ts` |
| LLM env + status | `src/lib/platform/llm-settings.ts`, Admin → AI Defaults (read-only) |
| Model routing | `src/lib/ai/model-routing.ts` |
| Memory layers | `src/lib/memory/*` (profile, compaction, mem0, agent-memory-context) |
| Webhook / send | `src/lib/whatsapp-webhook-handler.ts` |
| Image markers / strip | `src/lib/ai/message-markers.ts` |
| WebP → JPEG for WhatsApp | `src/lib/whatsapp-image.server.ts` |
| Store AI settings | `src/lib/ai/store-ai-settings.ts`, `ai-settings-types.ts` |
| Defaults | `src/lib/ai/platform-defaults.ts` |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-14 | Full rebuttal stress test 30/32 → fixed human handoff + memory-interest fallback; Mem0 playbook seeded (price ladder, buy-it, Roman Urdu objections, COD). |
| 2026-08-14 | Stress-test `scripts/train-sales-conversations.ts` + Mem0 seed for coach phone; identity/off-topic in runSalesAgent; Roman Urdu mehnga ≠ catalog; buy-it / I'll take it before bare-product; memory questions use Mem0 not search. |
| 2026-08-14 | “I want to buy it” sticks to the pitched product → checkout (phone/address), never search/browse for “it” or another item. |
| 2026-08-14 | “How are you” / “hey bro how are you” → natural “I'm fine…” reply; anti-spam “ask me a product” only for empty hi/hey loops. |
| 2026-08-14 | Roman Urdu product asks + bare names (e.g. Audionic buds) → search, not English greeting; reply in same language/script as customer. |
| 2026-08-14 | Anti-spam greetings: first hi = one welcome; hello/hey again → “How can I help you?” only — never re-send opening intro. |
| 2026-08-14 | Returning “hey again”: greet + ask for a product to show (not old catalog-list “which product from the list / pull it up”). Catalog browse context limited to recent turns. |
| 2026-08-14 | LLM-first for conversational intents (price/discount/ambiguous): no hardcoded recovery/clarify replies; intent router classifies only; Gemini writes the answer. Fast path kept for SKU/checkout/browse/policy only. |
| 2026-08-14 | Price-objection loop fix: match “costly / cost is high / % off / bulk”; never “Did you mean same product?” after a pitch; recovery before intent clarify (critical for ad traffic). |
| 2026-08-14 | Chat fixes: discount/offer → recovery (not catalog search); value before %; no double greeting after opening; “looking for product” / “different products” → browse not checkout; clarify copy no longer pushes address. |
| 2026-08-14 | Policy fast handlers: delivery ETA 3–5 days; damaged-by-courier → photos + failed-delivery note to support WhatsApp for refund (`policy-reply.ts`). |
| 2026-08-14 | Fix: “yes” after “Did you mean *product*?” continues that product instead of casual greeting (`product_confirm`; yes/ok removed from greeting-only). |
| 2026-08-14 | Off-topic: match “who are you / tell me who are you”; route identity before catalog pick; skip catalog-list fallback for identity. |
| 2026-08-14 | Identity: on “who are you / are you AI?” reply as agent name from the store here to help — do not say virtual assistant/AI/bot. |
| 2026-08-14 | System prompt rewrite: discount ladder; sales stages; stronger anti prompt-leak / injection rules (`build-system-prompt.ts`). |
| 2026-08-09 | History: pass full thread until ~70% of 120k budget, then summarize older chat and keep last 20 exact (`resolveAgentChatHistory`). |
| 2026-08-09 | Five-layer memory: 20-msg history (no time window), rolling summary compaction, customer profile, Mem0+pgvector recall; Pro model for hard negotiation. |
| 2026-08-09 | Removed chat history / session window controls from admin and reseller AI settings UIs. |
| 2026-08-09 | Gemini key + models from env only (`GEMINI_CHAT_MODEL`, `GEMINI_REASONING_MODEL`, `GEMINI_UTILITY_MODEL`); admin LLM panel is status-only (connected + model names). |
| 2026-07-16 | Product not in catalog: direct lookup returns a clear "not available" reply instead of generic SKU greeting; relevance filter on search hits. |
| 2026-07-16 | Webhook atomic dedup (`whatsapp_webhook_dedup`); no LLM on price objections (recovery only); discount shows real price; typo declines like "expsnive". |
| 2026-07-16 | Gemini fixes: model alias `gemini-3-flash` → `gemini-3-flash-preview`; webhook no longer drops replies if dedup migration missing; Gemini errors fall back to greeting. |
| 2026-07-16 | Recovery close message uses real product name from pitch (`findActiveProductContext`), not greeting/fallback lines. |
| 2026-07-16 | Admin LLM switch: Groq (env) vs Gemini (`gemini-3-flash` default) in Admin → AI Defaults → LLM Provider. |
| 2026-07-16 | Sales recovery: first refusal → quality/value reassurance; discount only on second decline; softer offer copy. |
| 2026-07-16 | Duplicate WhatsApp replies: dedupe inbound webhooks by Meta `wamid` (`meta_message_id` unique index). |
| 2026-07-16 | Casual greetings (`hi whats up`, etc.) → human rep intro via `tryDirectGreetingReply`; no catalog search or SKU-bot fallback. |
| 2026-07-16 | Active product context: follow-ups bind to the latest product pitch, not stale SKUs from earlier chats (`findActiveProductContext`). |
| 2026-07-16 | Follow-up variant/color/size questions use product from chat history (`formatProductFollowUpReply`); answers when only one option exists. |
| 2026-07-16 | Initial doc. Hybrid pipeline, stage-based prompt, human persona, SKU-priority lookup, product image handler, CDN URL extraction, WebP conversion for portal images. |
