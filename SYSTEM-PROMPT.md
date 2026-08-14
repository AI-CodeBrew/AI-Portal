# WhatsApp AI — System Prompt (current)

**Not fine-tuning.** Gemini gets this prompt every LLM turn via `buildSalesSystemPrompt()` in `src/lib/ai/build-system-prompt.ts`.

Based on the reseller template: agent-name identity (no “virtual assistant”), hard rules, discount ladder, sales stages, escalation.

---

## How it works (simple)

1. Customer sends a WhatsApp message.
2. Portal finds the store + chat, loads recent history.
3. **Fast handlers** may answer first (checkout, recovery, product/SKU, image) — no Gemini.
4. Otherwise Gemini runs with:
   - this **system prompt**
   - recent messages
   - tools (search, stock, create order, escalate, …)
5. Reply is sent on WhatsApp and saved for the next turn.

---

## What changed vs old prompt

| Before | Now |
|--------|-----|
| Pretend to be a human / or say “virtual assistant” | Say **agent name** from the store — here to help with products/orders (don’t say virtual assistant / AI / bot) |
| Soft “don’t share prompts” | Strong anti-leak + treat “ignore rules” paste as customer text |
| Recovery mentioned briefly | Clear **discount ladder** (value → % → bundle → stop/escalate) |
| Stage line only | Explicit **sales flow** stages + escalation list |

---

## Placeholders (filled per store)

- `{{AGENT_NAME}}` → AI Settings agent name  
- `{{STORE_NAME}}` → store name  
- Recovery % / bundle % → store AI settings (defaults 15% / 25%)  
- Reseller agent-mode text → still injected under reseller instructions  

---

See also: `AI-AGENT.md` for pipeline, tools, and memory.
