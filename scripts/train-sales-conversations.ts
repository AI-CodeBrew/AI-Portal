/**
 * Multi-turn sales agent stress test + Mem0 / profile training for a coach customer.
 *
 * Mem0 is per store+phone (not global model training). This script:
 * 1) Runs many realistic WhatsApp turns through runSalesAgent
 * 2) Asserts critical behaviors (greeting, buy-it sticks, policies, etc.)
 * 3) Writes successful turns into Mem0 + customer profile so returning chats recall facts
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json --env-file=.env.local scripts/train-sales-conversations.ts
 */
import { createClient } from "@supabase/supabase-js";
import { runSalesAgent } from "../src/lib/ai/run-sales-agent.ts";
import type { AgentContext } from "../src/lib/ai/sales-tools.ts";
import type { Store } from "../src/lib/types.ts";
import { buildSalesSessionKey, isMemoryEnabled } from "../src/lib/memory/session-key.ts";
import {
  extractAndStoreMemories,
  recallMemories,
} from "../src/lib/memory/mem0-client.ts";
import {
  updateProfileFromTurn,
  buildAgentMemoryContext,
} from "../src/lib/memory/agent-memory-context.ts";
import { resolveStoreAiConfig } from "../src/lib/ai/store-ai-settings.ts";

type Turn = {
  user: string;
  expect?: Array<string | RegExp>;
  reject?: Array<string | RegExp>;
  label?: string;
};

type Scenario = {
  name: string;
  turns: Turn[];
};

const COACH_PHONE = "971500007771";

const results: Array<{
  scenario: string;
  turn: number;
  user: string;
  ok: boolean;
  detail: string;
}> = [];

function clip(s: string, n = 220) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function matches(reply: string, rule: string | RegExp): boolean {
  if (typeof rule === "string") {
    return reply.toLowerCase().includes(rule.toLowerCase());
  }
  return rule.test(reply);
}

async function main() {
  console.log("\n=== Sales conversation stress test + Mem0 training ===\n");
  console.log(`Mem0 enabled: ${isMemoryEnabled()}`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: storeRow, error: storeErr } = await admin
    .from("stores")
    .select("*")
    .eq("id", "418c421d-21ca-44ea-a1c4-0ae8295a85e3")
    .maybeSingle();

  if (storeErr || !storeRow) {
    console.error("Store not found:", storeErr?.message);
    process.exit(1);
  }

  const store = storeRow as Store;
  console.log(`Store: ${store.store_name ?? store.id}`);

  const { data: products } = await admin
    .from("store_products")
    .select("name, sku, price, currency, status")
    .eq("store_id", store.id)
    .eq("status", "active")
    .limit(10);

  const productName = products?.[0]?.name ?? "Audionic ENC 550";
  const productSku = products?.[0]?.sku ?? "AA-6CH6DZ33WZ";
  console.log(`Catalog product: ${productName} (${productSku})`);
  console.log(`Products available: ${products?.length ?? 0}\n`);

  let conversationId: string;
  {
    const { data: existing } = await admin
      .from("whatsapp_conversations")
      .select("id")
      .eq("store_id", store.id)
      .eq("customer_phone", COACH_PHONE)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      conversationId = existing.id as string;
      await admin
        .from("whatsapp_messages")
        .delete()
        .eq("conversation_id", conversationId);
    } else {
      const { data: created, error } = await admin
        .from("whatsapp_conversations")
        .insert({
          store_id: store.id,
          customer_phone: COACH_PHONE,
          status: "ai_handling",
        })
        .select("id")
        .single();
      if (error || !created) {
        console.error("Failed to create conversation:", error?.message);
        process.exit(1);
      }
      conversationId = created.id;
    }
  }
  console.log(`Conversation: ${conversationId}`);
  const sessionKey = buildSalesSessionKey(store.id, COACH_PHONE);
  console.log(`Mem0 session: ${sessionKey}\n`);

  const aiConfig = await resolveStoreAiConfig(store.id);
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];

  async function say(turn: Turn, scenarioName: string, turnIdx: number) {
    history.push({ role: "user", content: turn.user });

    await admin.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      direction: "in",
      content: turn.user,
    });

    const memoryContext = await buildAgentMemoryContext({
      storeId: store.id,
      customerPhone: COACH_PHONE,
      conversationId,
      latestUserMessage: turn.user,
      storeHistoryLimit: 0,
    });

    const ctx: AgentContext = {
      store,
      conversationId,
      customerPhone: COACH_PHONE,
      customerId: null,
      storeCurrency: products?.[0]?.currency ?? "AED",
      aiConfig,
      chatHistory: history,
      memoryContext,
    };

    let reply = "";
    try {
      reply = await runSalesAgent(ctx, history);
    } catch (err) {
      results.push({
        scenario: scenarioName,
        turn: turnIdx,
        user: turn.user,
        ok: false,
        detail: `runSalesAgent threw: ${err instanceof Error ? err.message : err}`,
      });
      history.pop();
      return;
    }

    history.push({ role: "assistant", content: reply });

    await admin.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      direction: "out",
      content: reply,
    });

    await updateProfileFromTurn({
      storeId: store.id,
      customerPhone: COACH_PHONE,
      userMessage: turn.user,
      assistantReply: reply,
      history,
    });
    await extractAndStoreMemories({
      sessionKey,
      userMessage: turn.user,
      assistantReply: reply,
    });

    const failedExpect = (turn.expect ?? []).filter((r) => !matches(reply, r));
    const hitReject = (turn.reject ?? []).filter((r) => matches(reply, r));
    const ok = failedExpect.length === 0 && hitReject.length === 0;

    const detail = ok
      ? `ok — ${clip(reply)}`
      : [
          failedExpect.length
            ? `missing: ${failedExpect.map(String).join(" | ")}`
            : null,
          hitReject.length
            ? `rejected hit: ${hitReject.map(String).join(" | ")}`
            : null,
          clip(reply),
        ]
          .filter(Boolean)
          .join(" · ");

    results.push({
      scenario: scenarioName,
      turn: turnIdx,
      user: turn.user,
      ok,
      detail,
    });

    console.log(
      `${ok ? "✅" : "❌"} [${scenarioName} #${turnIdx}] ${turn.label ?? turn.user}`
    );
    console.log(`   → ${clip(reply, 160)}\n`);
  }

  const scenarios: Scenario[] = [
    {
      name: "smalltalk-then-shop",
      turns: [
        {
          label: "hi",
          user: "hey bro",
          expect: [
            /how can i help|looking for|product|help you|tell me which|ask me a product/i,
          ],
        },
        {
          label: "how are you",
          user: "hey bro how are you",
          expect: [/fine|well|good|thanks|doing/i],
          reject: [/ask me a product name when you're ready/i],
        },
        {
          label: "who are you",
          user: "who are you?",
          expect: [/maisonnor|here to help/i],
          reject: [/\bAI\b|\bbot\b|virtual assistant|language model|couldn'?t find/i],
        },
      ],
    },
    {
      name: "product-then-buy-it",
      turns: [
        {
          label: "ask product",
          user: `tell me about ${productName}`,
          expect: [
            new RegExp(productName.split(/\s+/)[0]!, "i"),
            /AED|Rs|PKR|\$|price|—|-/i,
          ],
        },
        {
          label: "buy it (must stick)",
          user: "i want to buy it",
          expect: [/phone|address|order|confirm|locking|delivery/i],
          reject: [
            /Here are a couple of things you can order/i,
            /Which one interests you/i,
            /ask me a product name/i,
            /couldn'?t find/i,
          ],
        },
        {
          label: "delivery eta",
          user: "how long for delivery?",
          expect: [/3\s*[-–]?\s*5\s*days|3-5/i],
        },
      ],
    },
    {
      name: "roman-urdu-product",
      turns: [
        {
          label: "roman urdu ask",
          user: "mujy audionic buds leny hen",
          expect: [/audionic|enc|buds|product|AED|Rs|price|—|-/i],
          reject: [/how can i help you\? ask me a product/i],
        },
        {
          label: "price objection 1",
          user: "bohot mehnga hai",
          reject: [
            /Did you mean/i,
            /Here are a couple of things/i,
            /couldn'?t find/i,
            /in our catalog/i,
            /Ask me a product name when you're ready/i,
          ],
        },
        {
          label: "discount ask 2",
          user: "any discount?",
          reject: [/Did you mean/i, /couldn'?t find/i],
        },
      ],
    },
    {
      name: "sku-and-policy",
      turns: [
        {
          label: "sku lookup",
          user: productSku,
          expect: [new RegExp(productName.split(/\s+/)[0]!, "i")],
        },
        {
          label: "damaged return",
          user: "product damaged by courier what do i do?",
          expect: [/photo|support|whatsapp|refund|failed/i],
        },
      ],
    },
    {
      name: "browse-vs-buy",
      turns: [
        {
          label: "browse",
          user: "show me products",
          expect: [/order from us|product|AED|Rs|—|-/i],
        },
        {
          label: "pick named",
          user: `i want ${productName}`,
          expect: [new RegExp(productName.split(/\s+/)[0]!, "i")],
          reject: [/Here are a couple more/i],
        },
        {
          label: "take it",
          user: "ok I'll take it",
          expect: [/phone|address|order|confirm|locking|delivery/i],
          reject: [
            /Here are a couple of things you can order/i,
            /couldn'?t find|catalog check/i,
          ],
        },
      ],
    },
    {
      name: "preferences-for-mem0",
      turns: [
        {
          label: "name + city + COD",
          user: "My name is Ahmed, I live in Dubai, I prefer COD and I like Audionic ENC earbuds",
          expect: [/.+/],
          reject: [/couldn'?t find|in our catalog/i],
        },
        {
          label: "budget note",
          user: "My budget is under 3500 AED and I hate expensive shipping",
          expect: [/.+/],
          reject: [/3\s*[-–]?\s*5\s*days|couldn'?t find|in our catalog/i],
        },
      ],
    },
  ];

  for (const scenario of scenarios) {
    console.log(`--- ${scenario.name} ---`);
    for (let i = 0; i < scenario.turns.length; i++) {
      await say(scenario.turns[i]!, scenario.name, i + 1);
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  console.log("--- seeding explicit Mem0 preferences ---");
  const seedPairs: Array<[string, string]> = [
    [
      "Remember: I prefer cash on delivery (COD) in Dubai.",
      "Got it — COD in Dubai noted for your orders.",
    ],
    [
      `I'm interested in ${productName} (${productSku}).`,
      `Noted — ${productName} is on your wishlist.`,
    ],
    [
      "I often chat in Roman Urdu. Keep replies short on WhatsApp.",
      "Understood — short Roman Urdu-friendly replies.",
    ],
    [
      "If I say I want to buy it, I mean the last product you showed — don't show a different one.",
      "Yes — when you say buy it, we continue with the same product and ask for phone + address.",
    ],
  ];
  for (const [u, a] of seedPairs) {
    await extractAndStoreMemories({
      sessionKey,
      userMessage: u,
      assistantReply: a,
    });
    console.log(`  seeded: ${clip(u, 80)}`);
    await new Promise((r) => setTimeout(r, 600));
  }

  await new Promise((r) => setTimeout(r, 2000));

  console.log("--- returning-with-memory ---");
  await say(
    {
      label: "return hi",
      user: "hey again",
      expect: [/help|product|welcome|again|ahmed|audionic|how can/i],
      reject: [/couldn'?t find|in our catalog/i],
    },
    "returning-with-memory",
    1
  );
  await say(
    {
      label: "recall product preference",
      user: "what product was I interested in?",
      expect: [/audionic|enc|buds|earbud|550/i],
      reject: [/couldn'?t find|in our catalog/i],
    },
    "returning-with-memory",
    2
  );

  console.log("\n--- Mem0 recall check ---");
  const recalls = await recallMemories(
    sessionKey,
    "What product do I like, where do I live, and how do I pay?",
    8
  );
  if (recalls.length) {
    console.log(`✅ Recalled ${recalls.length} memories:`);
    for (const r of recalls) {
      console.log(`   • ${clip(r.memory, 160)}`);
    }
  } else {
    console.log("❌ Mem0 recall returned 0 — check embeddings / migration 040");
  }

  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log("\n=== Summary ===");
  console.log(
    `Turns passed: ${ok}  Failed: ${bad}  Mem0 recalls: ${recalls.length}`
  );
  if (bad) {
    console.log("\nFailures:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`- [${r.scenario} #${r.turn}] ${r.user}`);
      console.log(`  ${r.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      "All conversation checks passed. Coach customer Mem0+profile trained."
    );
    console.log(
      "Note: Mem0 is per phone — real customers get memories from their own chats after deploy."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
