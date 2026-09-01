# Agent Working Notes — How the AI Agent, Mem0, and Address Recall Work

Investigated directly from source on 2026-08-16. File paths and line numbers refer to this repo.

---

## 1. How the AI agent works (overview)

This is a **WhatsApp sales agent**, not a fine-tuned model. It's Google Gemini driven by a system prompt + tools + a hybrid pipeline of deterministic handlers.

**Entry point:** `src/lib/whatsapp-webhook-handler.ts`
Flow per inbound WhatsApp message:

1. Meta webhook hits `whatsapp-webhook-handler.ts`.
2. Store is resolved by `whatsapp_phone_number_id` (each reseller = one store; everything below is scoped to that store, never cross-reseller).
3. Conversation is loaded (`store_id` + `customer_phone`).
4. Chat history for this turn is resolved (`resolveAgentChatHistory`, `whatsapp-webhook-handler.ts:531`) — full thread while under ~70% of a 120k token budget, then a rolling summary + last 20 exact messages.
5. Memory context is built (`buildAgentMemoryContext`, `whatsapp-webhook-handler.ts:537`) — see §2.
6. `runSalesAgent()` runs a **hybrid pipeline** (`src/lib/ai/run-sales-agent.ts`), handlers tried in order, first match wins:
   - **Exact routes** — SKU match, checkout with phone+address, catalog browse phrases, "yes" after "Did you mean", delivery/return policy.
   - **Intent router (LLM classify)** — only for high-confidence tool intents (search/browse/checkout/variant/image); ambiguous stuff falls through.
   - **Gemini sales agent** — writes the actual reply using the system prompt + tool-calling for objections, ambiguous phrasing, etc.
   - **Fallbacks** — canned catalog/checkout/greeting replies if Gemini fails.
7. Reply text is scanned for internal markers (`[Image: …]`, `[Ref: uuid]`) via `extractOutboundMedia()` and split into image + text sends.
8. Full reply (including internal markers) is saved to `whatsapp_messages` for history/stage-detection continuity, but customer only sees the stripped text.
9. **Post-reply, non-blocking**: `updateProfileFromTurn()` (rules-based profile update) and `extractAndStoreMemories()` (Mem0 write) both fire — `whatsapp-webhook-handler.ts:597-608`.

**Tools available to the LLM** (`src/lib/ai/sales-tools.ts:66-276`): `browse_catalog`, `search_products`, `check_stock`, `create_draft_order`, `confirm_order`, `cancel_order`, `lookup_customer_orders`, `get_order_status`, `escalate_to_human`, `recall_customer_memory`.

---

## 2. How Mem0 is used

**File:** `src/lib/memory/mem0-client.ts`

### Setup
- Vector store: Supabase Postgres + pgvector (prefers `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, table `memories`; falls back to raw `DATABASE_URL` / pgvector collection `mem0_memories`) — `mem0-client.ts:33-64`.
- Embeddings: Gemini `gemini-embedding-001`, 768 dims — `mem0-client.ts:14-15, 96-103`.
- Extraction LLM: Gemini utility model (`GEMINI_UTILITY_MODEL`) — `mem0-client.ts:104-111`.
- Soft-fails everywhere: if env vars are missing, Mem0 is silently disabled and the rest of the memory stack (profile, chat history, compaction) still works — `mem0-client.ts:66-77, 81-86`.
- Lazily constructed once per process (`memoryPromise` singleton) via `new Memory(config)` from `mem0ai/oss` — `mem0-client.ts:66-124`.

### Writing memories — `extractAndStoreMemories()`
```ts
// mem0-client.ts:154-176
export async function extractAndStoreMemories(params: {
  sessionKey: string;
  userMessage: string;
  assistantReply: string;
}): Promise<void> {
  ...
  await memory.add(
    [
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantReply },
    ],
    { userId: sessionKey }
  );
  ...
}
```
Called after **every** turn, non-blocking (`void extractAndStoreMemories(...)`) in `whatsapp-webhook-handler.ts:604-608`. Mem0's own extraction LLM (Gemini utility model) decides what's worth keeping from that user/assistant pair — this repo doesn't pre-filter it.

### Reading memories — `recallMemories()`
```ts
// mem0-client.ts:126-152
export async function recallMemories(
  sessionKey: string,
  query: string,
  limit = 5
): Promise<RecalledMemory[]> {
  ...
  const res = await memory.search(query, {
    topK: limit,
    filters: { user_id: sessionKey },
  });
  ...
}
```
This is **not called automatically every turn**. It only runs when the LLM itself decides to call the `recall_customer_memory` tool (`sales-tools.ts:257-275`, executed at `sales-tools.ts:1200-1223`). The tool description explicitly tells the model to use it only for things not visible in current chat/tool results — e.g. "what was I looking at before", "do you remember my size".

### Key (`user_id` / `sessionKey`)
`buildSalesSessionKey(storeId, customerPhone)` — `src/lib/memory/session-key.ts`. This is `"storeId:phone"`, so memory is scoped per store *and* per customer phone number, and persists across separate conversations/inbox-clears as long as the phone number is the same.

---

## 3. How the agent "already knows" the customer's address on a repeat order

This was the interesting part to trace — **there is no dedicated "saved address" field or address book anywhere in this codebase.** `create_draft_order` always requires the LLM to pass `phone`, `address1`, `city` explicitly as tool arguments (`sales-tools.ts:1064-1094`, required in schema at `sales-tools.ts:173`). Nothing auto-fills those fields server-side.

The apparent "it already knows my address" behavior comes from **two separate, indirect sources**, not a stored profile:

### A. Same-conversation chat history (the main reason, in practice)
`resolveAgentChatHistory()` (`src/lib/memory/conversation-compaction.ts:234`) passes the **full WhatsApp thread** to Gemini as long as it's under ~70% of the 120k token budget. If the customer typed their address earlier in *this same conversation* (e.g. for a previous order), that raw text is still sitting in the prompt context this turn. The LLM just re-reads it from visible history and reuses it — it isn't "recalled," it never left context. If the conversation gets summarized (over ~70% budget) or the customer starts a brand-new conversation thread, this stops working unless (B) kicks in.

### B. Mem0 raw-text recall across conversations (only if the model chooses to call it)
Because `memory.add()` stores the **raw user message text** (`mem0-client.ts:166-171`), if a customer previously typed something like "my address is House 12, Street 5, Lahore," that literal text is embedded and stored under `user_id = storeId:phone`. In a *new* conversation (old one cleared, or much later), the LLM can call `recall_customer_memory` (`sales-tools.ts:1200-1223`) with a query like "customer's delivery address," which runs `recallMemories()` → Mem0 vector search → returns matching stored text back to the model. The model then has to parse the address back out of that free-text memory itself. This only happens if the LLM proactively decides to call the tool — it is **not automatic**.

### What is explicitly NOT used for this
- **`customer_sales_profiles` (the rules-based profile layer, `src/lib/memory/customer-profile.ts`)** does not have an address field at all — only `name`, `language`, `funnel_stage`, `budget_range`, `interested_products/skus`, `objections`, `last_order_summary`, `preferred_payment`, `agent_notes`. The only address-adjacent thing it stores is **city**, and only as free text stuffed into `agent_notes` (`agent-memory-context.ts:84-86`):
  ```ts
  // agent-memory-context.ts:84-86
  if (checkout?.city) {
    patch.agent_notes = `City: ${checkout.city}`;
  }
  ```
  No street address, no address1/address2, no zip.
- **`lookup_customer_orders` / `get_order_status` tool results deliberately exclude the address.** The DB query itself selects `shipping_address` (`sales-tools.ts:439, 457`), but the *mapped return object* sent back to the LLM strips it out — compare the `select(...)` at `sales-tools.ts:436-461` (includes `shipping_address`) against the actual returned shape at `sales-tools.ts:483-503`, which only has `order_number, status, source, total, currency, total_formatted, items, tracking_number, tracking_company, created_at`. So even when the agent looks up a past order for status, it cannot see that order's address through this tool.

### Practical implication (worth knowing)
Because there's no canonical stored address, a repeat order can:
- reuse a stale/wrong address silently if it's still sitting in visible chat history from weeks ago, or
- ask the customer again for the address if the conversation was cleared and Mem0 recall isn't triggered by the model.

If you want reliable "remember my last delivery address" behavior, the fix is structural, not prompt-tuning: add a real `last_shipping_address` (jsonb) column to `customer_sales_profiles`, populate it from `checkout-parse.ts`'s parsed address on successful `create_draft_order`, and surface it in the system prompt / a tool result the same way `agent_notes` is surfaced today — rather than relying on chat-window luck or an LLM-triggered Mem0 free-text search.

---

## Reference: relevant files

| Area | File |
|---|---|
| Webhook entry / orchestration | `src/lib/whatsapp-webhook-handler.ts` |
| Hybrid pipeline order | `src/lib/ai/run-sales-agent.ts` |
| Tools + order creation | `src/lib/ai/sales-tools.ts` |
| Checkout text parsing (address/phone/city) | `src/lib/ai/checkout-parse.ts` |
| Order creation (portal/Shopify) | `src/lib/orders/whatsapp-create.ts` |
| Mem0 client (add/search) | `src/lib/memory/mem0-client.ts` |
| Rules-based customer profile (no address field) | `src/lib/memory/customer-profile.ts` |
| Per-turn memory context builder | `src/lib/memory/agent-memory-context.ts` |
| Chat history / compaction | `src/lib/memory/conversation-compaction.ts` |
| Session key (`storeId:phone`) | `src/lib/memory/session-key.ts` |
| Existing high-level agent doc | `AI-AGENT.md` (repo root) |
