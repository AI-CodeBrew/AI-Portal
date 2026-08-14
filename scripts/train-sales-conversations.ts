/**
 * Full sales stress test: greetings, buy-it, policies, AND rebuttal ladder.
 * Writes turns + playbook facts into Mem0 for the coach customer.
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
  /** Clear history before this turn (new objection track) */
  resetHistory?: boolean;
};

type Scenario = { name: string; turns: Turn[] };

const COACH_PHONE = "971500007771";
const CATALOG_FAIL = /couldn'?t find|in our catalog|catalog check mein issue|Did you mean/i;
const BROWSE_LIST = /Here are a couple of things you can order/i;
const WAITING_SPAM = /Ask me a product name when you're ready/i;

const results: Array<{
  scenario: string;
  turn: number;
  user: string;
  ok: boolean;
  detail: string;
}> = [];

function clip(s: string, n = 200) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function matches(reply: string, rule: string | RegExp): boolean {
  return typeof rule === "string"
    ? reply.toLowerCase().includes(rule.toLowerCase())
    : rule.test(reply);
}

async function main() {
  console.log("\n=== Full rebuttal + handling stress test + Mem0 train ===\n");
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
  const { data: products } = await admin
    .from("store_products")
    .select("name, sku, price, currency, status")
    .eq("store_id", store.id)
    .eq("status", "active")
    .limit(10);

  const productName = products?.[0]?.name ?? "Audionic ENC 550";
  const productSku = products?.[0]?.sku ?? "AA-6CH6DZ33WZ";
  const productBrand = productName.split(/\s+/)[0]!;
  console.log(`Store: ${store.store_name} | Product: ${productName} (${productSku})\n`);

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
        console.error(error?.message);
        process.exit(1);
      }
      conversationId = created.id;
    }
  }

  const sessionKey = buildSalesSessionKey(store.id, COACH_PHONE);
  const aiConfig = await resolveStoreAiConfig(store.id);
  const recoveryPct = aiConfig?.effectiveRecoveryDiscountPercent ?? 20;
  console.log(`Conversation: ${conversationId}`);
  console.log(`Mem0 session: ${sessionKey}`);
  console.log(`Recovery %: ${recoveryPct}\n`);

  let history: Array<{ role: "user" | "assistant"; content: string }> = [];

  async function say(turn: Turn, scenarioName: string, turnIdx: number) {
    if (turn.resetHistory) history = [];

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
        detail: `threw: ${err instanceof Error ? err.message : err}`,
      });
      history.pop();
      console.log(`❌ [${scenarioName} #${turnIdx}] threw\n`);
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

    results.push({
      scenario: scenarioName,
      turn: turnIdx,
      user: turn.user,
      ok,
      detail: ok
        ? `ok — ${clip(reply)}`
        : [
            failedExpect.length
              ? `missing: ${failedExpect.map(String).join(" | ")}`
              : null,
            hitReject.length
              ? `rejected: ${hitReject.map(String).join(" | ")}`
              : null,
            clip(reply),
          ]
            .filter(Boolean)
            .join(" · "),
    });

    console.log(
      `${ok ? "✅" : "❌"} [${scenarioName} #${turnIdx}] ${turn.label ?? turn.user}`
    );
    console.log(`   → ${clip(reply, 150)}\n`);
  }

  const pitchThen = (rebuttals: Turn[]): Turn[] => [
    {
      label: "pitch",
      user: `tell me about ${productName}`,
      expect: [new RegExp(productBrand, "i")],
      reject: [CATALOG_FAIL, WAITING_SPAM],
      resetHistory: true,
    },
    ...rebuttals,
  ];

  const scenarios: Scenario[] = [
    {
      name: "smalltalk",
      turns: [
        {
          label: "hi",
          user: "hey",
          expect: [/product|help|show you/i],
          resetHistory: true,
        },
        {
          label: "how are you",
          user: "how are you doing?",
          expect: [/fine|well|good|thanks|doing/i],
          reject: [WAITING_SPAM],
        },
        {
          label: "who are you",
          user: "are you a bot?",
          expect: [/here to help|maisonnor|umer/i],
          reject: [/virtual assistant|language model|i'?m an? ai\b/i, CATALOG_FAIL],
        },
      ],
    },
    {
      name: "buy-it-stick",
      turns: pitchThen([
        {
          label: "buy it",
          user: "i want to buy it",
          expect: [/phone|address|locking|order/i],
          reject: [BROWSE_LIST, CATALOG_FAIL, WAITING_SPAM],
        },
      ]),
    },
    {
      name: "rebuttal-price-ladder-en",
      turns: pitchThen([
        {
          label: "1st costly (no %)",
          user: "too expensive",
          expect: [/.+/],
          reject: [
            CATALOG_FAIL,
            BROWSE_LIST,
            WAITING_SPAM,
            new RegExp(`${recoveryPct}\\s*%`, "i"),
            /\d+\s*%\s*off/i,
          ],
        },
        {
          label: "2nd discount ask",
          user: "any discount please?",
          expect: [/.+/],
          reject: [CATALOG_FAIL, BROWSE_LIST, WAITING_SPAM],
        },
        {
          label: "3rd still refuse",
          user: "still too much, I won't buy",
          expect: [/.+/],
          reject: [CATALOG_FAIL, BROWSE_LIST],
        },
      ]),
    },
    {
      name: "rebuttal-roman-urdu",
      turns: pitchThen([
        {
          label: "mehnga",
          user: "bohot mehnga hai bhai",
          reject: [CATALOG_FAIL, BROWSE_LIST, WAITING_SPAM],
        },
        {
          label: "sasta chahiye",
          user: "kuch sasta offer hai?",
          reject: [CATALOG_FAIL, BROWSE_LIST],
        },
        {
          label: "accept deal",
          user: "ok deal, I want it",
          expect: [/phone|address|locking|order|delivery/i],
          reject: [CATALOG_FAIL, BROWSE_LIST],
        },
      ]),
    },
    {
      name: "rebuttal-variants",
      turns: pitchThen([
        {
          label: "cost is high",
          user: "cost is high for me",
          reject: [CATALOG_FAIL, BROWSE_LIST, /Did you mean/i],
        },
      ]),
    },
    {
      name: "rebuttal-bulk",
      turns: pitchThen([
        {
          label: "bulk %",
          user: "can I get 20% off on bulk?",
          reject: [CATALOG_FAIL, BROWSE_LIST, /Did you mean/i],
        },
      ]),
    },
    {
      name: "rebuttal-think-later",
      turns: pitchThen([
        {
          label: "maybe later",
          user: "I'll think about it, maybe later",
          reject: [CATALOG_FAIL, BROWSE_LIST],
        },
      ]),
    },
    {
      name: "rebuttal-competitor",
      turns: pitchThen([
        {
          label: "cheaper elsewhere",
          user: "I saw cheaper online somewhere else",
          reject: [CATALOG_FAIL, BROWSE_LIST, WAITING_SPAM],
        },
      ]),
    },
    {
      name: "policy-delivery-return",
      turns: [
        {
          label: "eta",
          user: "how long for delivery?",
          expect: [/3\s*[-–]?\s*5/i],
          reject: [CATALOG_FAIL],
          resetHistory: true,
        },
        {
          label: "damaged",
          user: "courier damaged my product, what now?",
          expect: [/photo|refund|failed|support|whatsapp/i],
          reject: [CATALOG_FAIL],
        },
      ],
    },
    {
      name: "sku-browse-take",
      turns: [
        {
          label: "sku",
          user: productSku,
          expect: [new RegExp(productBrand, "i")],
          resetHistory: true,
        },
        {
          label: "browse",
          user: "show me other products",
          expect: [/order from us|product|AED|Rs|—|-/i],
        },
        {
          label: "want named again",
          user: `i want ${productName}`,
          expect: [new RegExp(productBrand, "i")],
          reject: [/Here are a couple more/i],
        },
        {
          label: "take it",
          user: "ok I'll take it",
          expect: [/phone|address|locking|order/i],
          reject: [BROWSE_LIST, CATALOG_FAIL],
        },
      ],
    },
    {
      name: "handoff-and-prefs",
      turns: [
        {
          label: "human",
          user: "I want to talk to a human please",
          expect: [/.+/],
          reject: [CATALOG_FAIL],
          resetHistory: true,
        },
        {
          label: "prefs",
          user: "My name is Ahmed, I live in Dubai, prefer COD, budget under 3500 AED",
          expect: [/.+/],
          reject: [CATALOG_FAIL, /3\s*[-–]?\s*5\s*days/i],
        },
      ],
    },
  ];

  for (const scenario of scenarios) {
    console.log(`--- ${scenario.name} ---`);
    for (let i = 0; i < scenario.turns.length; i++) {
      await say(scenario.turns[i]!, scenario.name, i + 1);
      await new Promise((r) => setTimeout(r, 700));
    }
  }

  // Playbook facts for Mem0 (coach customer + pattern library for this session)
  console.log("--- seeding Mem0 rebuttal playbook ---");
  const playbook: Array<[string, string]> = [
    [
      "When I say a product is too expensive the first time, reassure quality — do not give % off yet.",
      "Understood — first price objection = value pitch only, no discount percent.",
    ],
    [
      `On a second discount ask after pitching ${productName}, you may offer about ${recoveryPct}% off and ask for phone + address.`,
      `Yes — second refusal can use ~${recoveryPct}% off on the pitched product, then collect checkout details.`,
    ],
    [
      "If I still refuse after the % offer, offer a 2-pack bundle deal once, then stop pushing.",
      "Got it — third step is bundle deal once, then soft close or human handoff.",
    ],
    [
      "Roman Urdu like 'bohot mehnga' or 'sasta offer' is a price objection, never a product search.",
      "Correct — mehnga/sasta = price talk in the same product thread.",
    ],
    [
      "If I say I want to buy it / I'll take it, lock the last shown product and ask phone + address — never show a different product.",
      "Yes — buy-it always continues the pitched product into checkout details.",
    ],
    [
      "I prefer COD in Dubai. Interested in Audionic ENC earbuds. Keep replies short; I often use Roman Urdu.",
      "Noted — Ahmed-style prefs: COD, Dubai, Audionic ENC, short Roman Urdu OK.",
    ],
    [
      "Delivery takes 3-5 days. Damaged by courier → photos + failed-delivery note to support WhatsApp for refund.",
      "Policy locked — ETA 3–5 days; damaged courier flow uses photos + support WhatsApp.",
    ],
  ];

  for (const [u, a] of playbook) {
    await extractAndStoreMemories({ sessionKey, userMessage: u, assistantReply: a });
    console.log(`  seeded: ${clip(u, 70)}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  await new Promise((r) => setTimeout(r, 2000));

  console.log("\n--- returning memory checks ---");
  await say(
    {
      label: "hey again",
      user: "hey again",
      expect: [/help|product|how can/i],
      reject: [CATALOG_FAIL],
      resetHistory: true,
    },
    "returning",
    1
  );
  await say(
    {
      label: "what was I interested in",
      user: "what product was I interested in?",
      expect: [/audionic|enc|buds|earbud|550/i],
      reject: [CATALOG_FAIL],
    },
    "returning",
    2
  );
  await say(
    {
      label: "price again with memory",
      user: `show ${productName} again — is there any discount?`,
      reject: [CATALOG_FAIL, WAITING_SPAM],
    },
    "returning",
    3
  );

  const recalls = await recallMemories(
    sessionKey,
    "How should price objections and buy-it be handled? What do I prefer?",
    10
  );
  console.log(`\nMem0 recalled ${recalls.length}:`);
  for (const r of recalls) console.log(`  • ${clip(r.memory, 140)}`);

  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n=== Summary: ${ok} passed, ${bad} failed, Mem0=${recalls.length} ===`);
  if (bad) {
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`- [${r.scenario} #${r.turn}] ${r.user}`);
      console.log(`  ${r.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log("All handling checks passed. Mem0 playbook trained for coach phone.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
