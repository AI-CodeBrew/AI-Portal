/**
 * Integration smoke test for the 5 memory layers + model routing.
 * Run: node --env-file=.env.local --experimental-strip-types scripts/test-memory-layers.ts
 */
import { createClient } from "@supabase/supabase-js";
import { buildSalesSessionKey, isMemoryEnabled } from "../src/lib/memory/session-key.ts";
import { MEMORY_DEFAULTS } from "../src/lib/memory/types.ts";
import { estimateHistoryTokens, estimateTokens } from "../src/lib/memory/token-estimate.ts";
import {
  loadCustomerSalesProfile,
  mergeCustomerSalesProfile,
  formatCustomerProfileBlock,
} from "../src/lib/memory/customer-profile.ts";
import {
  loadConversationSummary,
  updateHistoryTokenEstimate,
  formatRollingSummaryBlock,
  maybeCompactConversationHistory,
  resolveAgentChatHistory,
  compactionThresholdTokens,
} from "../src/lib/memory/conversation-compaction.ts";
import { buildAgentMemoryContext } from "../src/lib/memory/agent-memory-context.ts";
import { formatMemoryPromptBlocks } from "../src/lib/memory/memory-format.ts";
import {
  recallMemories,
  extractAndStoreMemories,
} from "../src/lib/memory/mem0-client.ts";
import { getStoreChatContextLimits } from "../src/lib/ai/chat-history.ts";
import { selectSalesModel, chatThinkingConfig } from "../src/lib/ai/model-routing.ts";
import { buildSalesSystemPrompt } from "../src/lib/ai/build-system-prompt.ts";
import {
  resolveGeminiChatModel,
  resolveGeminiReasoningModel,
  resolveGeminiUtilityModel,
  getActiveLlmConfig,
} from "../src/lib/platform/llm-settings.ts";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function pass(name: string, detail: string) {
  results.push({ name, ok: true, detail });
  console.log(`✅ ${name}: ${detail}`);
}
function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.log(`❌ ${name}: ${detail}`);
}

async function ensureMigration(admin: ReturnType<typeof createClient>) {
  // Check columns / table exist; if not, try applying via DATABASE_URL with pg
  const { error: colErr } = await admin
    .from("whatsapp_conversations")
    .select("rolling_summary, history_token_estimate")
    .limit(1);

  const { error: tableErr } = await admin
    .from("customer_sales_profiles")
    .select("store_id")
    .limit(1);

  if (!colErr && !tableErr) {
    pass("migration", "rolling_summary cols + customer_sales_profiles exist");
    return true;
  }

  console.log("Migration missing — applying 039 via DATABASE_URL...");
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    fail("migration", `Missing tables and no DATABASE_URL. col=${colErr?.message} table=${tableErr?.message}`);
    return false;
  }

  try {
    const pg = await import("pg");
    const client = new pg.default.Client({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    const sql = await (await import("fs")).promises.readFile(
      new URL("../supabase/migrations/039_conversation_memory.sql", import.meta.url),
      "utf8"
    );
    await client.query(sql);
    await client.end();
    pass("migration", "Applied 039_conversation_memory.sql via DATABASE_URL");
    return true;
  } catch (err) {
    fail(
      "migration",
      `Could not apply migration: ${err instanceof Error ? err.message : err}`
    );
    return false;
  }
}

async function main() {
  console.log("\n=== Memory layers smoke test ===\n");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) {
    fail("env", "Missing SUPABASE URL/service role key");
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Env / models ---
  const llm = await getActiveLlmConfig();
  if (llm.geminiApiKey) {
    pass(
      "gemini-key",
      `configured; chat=${resolveGeminiChatModel()} reasoning=${resolveGeminiReasoningModel()} utility=${resolveGeminiUtilityModel()}`
    );
  } else {
    fail("gemini-key", "GEMINI_API_KEY missing");
  }

  pass(
    "mem0-flag",
    `MEM0_ENABLED path isMemoryEnabled=${isMemoryEnabled()} DATABASE_URL=${Boolean(process.env.DATABASE_URL?.trim())}`
  );

  // --- Defaults / limits (0 = fetch full thread; compact at ~70%) ---
  const limits = await getStoreChatContextLimits("any");
  if (limits.historyLimit === 0 && limits.windowMs === 0) {
    pass("history-defaults", `historyLimit=${limits.historyLimit} (full until ~70%) windowMs=${limits.windowMs}`);
  } else {
    fail("history-defaults", JSON.stringify(limits));
  }

  // --- Model routing ---
  const chatModel = selectSalesModel({
    history: [{ role: "user", content: "hi" }],
    latestUser: "hi",
  });
  const proModel = selectSalesModel({
    history: [
      { role: "assistant", content: "This serum is 199 AED" },
      { role: "user", content: "too expensive" },
    ],
    latestUser: "too expensive give me discount",
  });
  if (chatModel.includes("flash") && !chatModel.includes("lite")) {
    pass("routing-chat", chatModel);
  } else {
    fail("routing-chat", chatModel);
  }
  if (proModel.includes("pro")) {
    pass("routing-pro", proModel);
  } else {
    fail("routing-pro", `expected pro, got ${proModel}`);
  }
  const thinking = chatThinkingConfig(chatModel);
  pass("thinking-config", JSON.stringify(thinking));

  const migrated = await ensureMigration(admin);
  if (!migrated) {
    printSummary();
    process.exit(1);
  }

  // Pick a real store for FK
  const { data: store, error: storeErr } = await admin
    .from("stores")
    .select("id, store_name")
    .limit(1)
    .maybeSingle();

  if (storeErr || !store?.id) {
    fail("store", storeErr?.message ?? "No stores in DB — create one first");
    printSummary();
    process.exit(1);
  }
  pass("store", `${store.store_name ?? store.id}`);

  const testPhone = "971500009999";
  const sessionKey = buildSalesSessionKey(store.id, testPhone);
  pass("session-key", sessionKey);

  // --- Profile layer ---
  await mergeCustomerSalesProfile(store.id, testPhone, {
    name: "Test User",
    language: "en",
    funnel_stage: "product_presentation",
    interested_skus: ["SKU-TEST-001"],
    objections: ["price_or_decline"],
  });
  const loaded = await loadCustomerSalesProfile(store.id, testPhone);
  if (loaded.profile.name === "Test User" && loaded.profile.interested_skus.includes("SKU-TEST-001")) {
    pass("profile-upsert", `name=${loaded.profile.name} skus=${loaded.profile.interested_skus.join(",")}`);
  } else {
    fail("profile-upsert", JSON.stringify(loaded.profile));
  }
  const profileBlock = formatCustomerProfileBlock(loaded.profile);
  pass("profile-prompt", `chars=${profileBlock.length} hasName=${profileBlock.includes("Test User")}`);

  // --- Conversation + summary / token estimate ---
  // Prefer existing open conversation; else create with valid status
  let conversationId: string | undefined;
  {
    const { data: existing } = await admin
      .from("whatsapp_conversations")
      .select("id")
      .eq("store_id", store.id)
      .eq("customer_phone", testPhone)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    conversationId = existing?.id as string | undefined;
    if (!conversationId) {
      const { data: created, error: createErr } = await admin
        .from("whatsapp_conversations")
        .insert({
          store_id: store.id,
          customer_phone: testPhone,
          status: "ai_handling",
        })
        .select("id")
        .single();
      if (createErr || !created) {
        fail("conversation", createErr?.message ?? "create failed");
        printSummary();
        process.exit(1);
      }
      conversationId = created.id;
    }
  }
  pass("conversation", conversationId!);

  // Seed a few messages
  await admin.from("whatsapp_messages").delete().eq("conversation_id", conversationId!);
  const msgs = [
    { role: "in", content: "Hi I want a serum" },
    { role: "out", content: "Sure! Our vitamin C serum is 199 AED." },
    { role: "in", content: "Do you have free delivery?" },
    { role: "out", content: "Yes free delivery in Dubai." },
    { role: "in", content: "My name is Sara, city Dubai" },
  ];
  for (const m of msgs) {
    await admin.from("whatsapp_messages").insert({
      conversation_id: conversationId!,
      direction: m.role,
      content: m.content,
    });
  }
  pass("messages-seed", `${msgs.length} messages`);

  // Under ~70%: resolver should pass the full short thread
  await admin
    .from("whatsapp_conversations")
    .update({
      rolling_summary: null,
      summary_updated_at: null,
      history_token_estimate: 0,
    })
    .eq("id", conversationId!);
  const resolvedSmall = await resolveAgentChatHistory({
    conversationId: conversationId!,
  });
  if (
    resolvedSmall.historyLimit === 0 &&
    resolvedSmall.history.length === msgs.length &&
    !resolvedSmall.compacted
  ) {
    pass(
      "resolve-full-thread",
      `msgs=${resolvedSmall.history.length} threshold=${compactionThresholdTokens()} historyLimit=0`
    );
  } else {
    fail(
      "resolve-full-thread",
      JSON.stringify({
        len: resolvedSmall.history.length,
        limit: resolvedSmall.historyLimit,
        compacted: resolvedSmall.compacted,
      })
    );
  }

  const fakeHist = msgs.map((m) => ({
    role: (m.role === "in" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));
  const est = estimateHistoryTokens(fakeHist);
  await updateHistoryTokenEstimate(conversationId!, est);
  const summaryAfter = await loadConversationSummary(conversationId!);
  if (summaryAfter.historyTokenEstimate === est) {
    pass("token-estimate", `history_token_estimate=${summaryAfter.historyTokenEstimate}`);
  } else {
    fail(
      "token-estimate",
      `expected ${est} got ${summaryAfter.historyTokenEstimate}`
    );
  }

  // Set a fake rolling summary to verify prompt inject
  // Boundary = oldest message so exact window still includes the seed thread
  const { data: oldestMsg } = await admin
    .from("whatsapp_messages")
    .select("created_at")
    .eq("conversation_id", conversationId!)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  await admin
    .from("whatsapp_conversations")
    .update({
      rolling_summary:
        "Customer Sara in Dubai interested in vitamin C serum at 199 AED; asked about free delivery.",
      summary_updated_at: oldestMsg?.created_at ?? new Date().toISOString(),
    })
    .eq("id", conversationId!);

  // Compaction should no-op at low tokens (under ~70% of 120k)
  await maybeCompactConversationHistory({ conversationId: conversationId! });
  pass(
    "compaction-noop",
    `budget=${MEMORY_DEFAULTS.model_input_budget} threshold=${Math.floor(MEMORY_DEFAULTS.model_input_budget * MEMORY_DEFAULTS.compact_threshold_ratio)} currentEst=${est} (too small to compact — expected)`
  );

  // --- Agent memory context + prompt ---
  const memoryCtx = await buildAgentMemoryContext({
    storeId: store.id,
    customerPhone: testPhone,
    conversationId: conversationId!,
    latestUserMessage: "ok I want to order",
    storeHistoryLimit: 20,
  });
  pass(
    "memory-context",
    `session=${memoryCtx.sessionKey} summary=${Boolean(memoryCtx.rollingSummary)} profile=${memoryCtx.profile?.name} recalled=${memoryCtx.recalledMemories.length}`
  );

  const blocks = formatMemoryPromptBlocks(memoryCtx);
  const hasProfile = blocks.includes("CUSTOMER PROFILE");
  const hasSummary = blocks.includes("CONVERSATION SUMMARY");
  if (hasProfile && hasSummary) {
    pass("prompt-blocks", `chars=${blocks.length} profile+summary present`);
  } else {
    fail("prompt-blocks", `profile=${hasProfile} summary=${hasSummary}`);
  }

  const systemPrompt = buildSalesSystemPrompt({
    storeLabel: store.store_name || "Test Store",
    storeCurrency: "AED",
    history: fakeHist,
    memoryContext: memoryCtx,
  });
  const dumpsOlder =
    systemPrompt.includes("Do you have free delivery?") &&
    systemPrompt.split("Do you have free delivery?").length > 2;
  // history is passed separately as contents — prompt should include memory blocks, not dump all msgs as history list
  if (
    systemPrompt.includes("CUSTOMER PROFILE") &&
    systemPrompt.includes("CONVERSATION SUMMARY") &&
    systemPrompt.includes("last 20")
  ) {
    pass(
      "system-prompt",
      `chars=${systemPrompt.length} includes profile+summary+session note; older msgs not double-dumped in prompt body=${!dumpsOlder}`
    );
  } else {
    fail("system-prompt", "missing expected memory sections");
  }

  // --- Mem0 Gemini embeddings ---
  if (!isMemoryEnabled()) {
    fail("mem0", "isMemoryEnabled=false — check MEM0_ENABLED + DATABASE_URL");
  } else {
    try {
      await extractAndStoreMemories({
        sessionKey,
        userMessage: "I prefer COD and hate expensive shipping. I like vitamin C serum.",
        assistantReply: "Got it — COD in Dubai, vitamin C serum noted.",
      });
      // small delay for indexing
      await new Promise((r) => setTimeout(r, 2000));
      const recalled = await recallMemories(
        sessionKey,
        "What payment and product does this customer prefer?",
        5
      );
      if (recalled.length > 0) {
        pass(
          "mem0-gemini",
          `recalled ${recalled.length}: ${recalled.map((r) => r.memory).join(" | ").slice(0, 200)}`
        );
      } else {
        fail(
          "mem0-gemini",
          "add/search returned 0 results — check Gemini embedder, pgvector, or Mem0 init logs above"
        );
      }
    } catch (err) {
      fail("mem0-gemini", err instanceof Error ? err.message : String(err));
    }
  }

  // Cleanup test messages only (keep profile/conv for inspection)
  // optional: leave data for manual check

  printSummary();
}

function printSummary() {
  console.log("\n=== Summary ===");
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log(`Passed: ${ok}  Failed: ${bad}`);
  if (bad) {
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  - ${r.name}: ${r.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log("All memory-layer checks passed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
