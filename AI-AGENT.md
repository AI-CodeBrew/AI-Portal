# WhatsApp AI Sales Agent

Living documentation for how the portal’s WhatsApp sales AI works. **Update this file whenever you change AI behavior, prompts, tools, or message flow.**

Last updated: 2026-07-16

---

## Overview

The agent is **not fine-tuned**. It is a general LLM (Groq **Llama 3.3 70B** by default, Anthropic Claude as fallback) guided by:

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

Handlers run **in order**. First match wins; LLM only runs if nothing else handles the message.

| Order | Handler | File | When |
|------|---------|------|------|
| 1 | Checkout | `checkout-reply.ts` | Customer sends name + phone + address (or after assistant asked for details) |
| 2 | Sales recovery | `sales-recovery.ts` | Decline / “too expensive” after product pitch → discount → bundle → stop |
| 3 | Product image | `product-reply.ts` | “Send/share/show product image/photo” |
| 4 | Product lookup | `product-reply.ts` | SKU or product name question (SKU wins even if message says “want to order”) |
| 5 | LLM | `groq-agent.ts` / `anthropic-agent.ts` | Everything else |

If the LLM throws, the webhook falls back to direct product/image lookup before a generic error message.

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

- **Identity** — acts as named sales rep at store; never admits being AI
- **Tone** — 1–3 short WhatsApp lines; same language as customer; no markdown lists
- **Hard rules** — no invented prices; escalate refunds/complaints; no pasted image URLs
- **Reseller instructions** — from `whatsappSalesInstructions` / templates
- **Conversation stage** — from `conversation-stage.ts` (see below)
- **Customer context** — name, ad SKU, structured summary, pending orders
- **Tool rules** — `SALES_TOOL_RULES` in `sales-tools.ts`

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

- After product pitch, on decline: **Deal 1/2** (configurable % off) → **Deal 2/2** (2-pack bundle) → polite stop
- Uses internal markers: `[Deal 1/2 — N% off]`, `[Deal 2/2 — …]`, `[Deal closed]`
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

Processing: `message-markers.ts` → `extractOutboundMedia()`

- Pulls `[Image: …]` markers
- Also extracts bare CDN URLs (Shopify CDN, Bunny) if the LLM pasted links in text
- Portal WebP images: converted to JPEG and uploaded via WhatsApp Media API (`whatsapp-image.server.ts`)

Send order in webhook: images first (with delay), then text.

---

## Chat memory

| Setting | Default | Source |
|---------|---------|--------|
| History limit | 10 messages | `ai_chat_history_limit` / platform default |
| Session window | 2 hours | `ai_session_window_hours` |

- AI only sees messages inside the window (`chat-history.ts`)
- Full history remains in reseller inbox
- Internal markers kept in DB so recovery/stages still work

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
| `GROQ_API_KEY` | Primary LLM (preferred) |
| `GROQ_MODEL` | Optional override (default `llama-3.3-70b-versatile`) |
| `ANTHROPIC_API_KEY` | Fallback LLM |
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
| Groq / Anthropic loops | `src/lib/ai/groq-agent.ts`, `anthropic-agent.ts` |
| Webhook / send | `src/lib/whatsapp-webhook-handler.ts` |
| Image markers / strip | `src/lib/ai/message-markers.ts` |
| WebP → JPEG for WhatsApp | `src/lib/whatsapp-image.server.ts` |
| Store AI settings | `src/lib/ai/store-ai-settings.ts`, `ai-settings-types.ts` |
| Defaults | `src/lib/ai/platform-defaults.ts` |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-16 | Active product context: follow-ups bind to the latest product pitch, not stale SKUs from earlier chats (`findActiveProductContext`). |
| 2026-07-16 | Follow-up variant/color/size questions use product from chat history (`formatProductFollowUpReply`); answers when only one option exists. |
| 2026-07-16 | Initial doc. Hybrid pipeline, stage-based prompt, human persona, SKU-priority lookup, product image handler, CDN URL extraction, WebP conversion for portal images. |
