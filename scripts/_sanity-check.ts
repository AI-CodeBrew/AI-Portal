/**
 * Sanity-check the new LLM-router sales agent flow against real conversation
 * patterns. Uses the real "maisonnor" store's real catalog (read-only calls
 * are safe), but a FAKE conversationId/customerPhone so any tool call that
 * writes data (create_draft_order, escalate_to_human) never touches a real
 * customer or real conversation row. Any test order created gets deleted at
 * the end.
 *
 * Run: node --env-file=.env.local --experimental-strip-types scripts/_sanity-check.ts
 */
import { randomUUID } from "crypto";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { runSalesAgent } from "../src/lib/ai/run-sales-agent.ts";
import type { AgentContext } from "../src/lib/ai/sales-tools.ts";

const STORE_ID = "418c421d-21ca-44ea-a1c4-0ae8295a85e3"; // maisonnor
const FAKE_PHONE = "923001110099"; // not a real WhatsApp user — safe if any send is attempted
const FAKE_CONVERSATION_ID = randomUUID(); // doesn't exist in DB — writes touch 0 real rows

type Turn = { role: "user" | "assistant"; content: string };

async function loadStore() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .eq("id", STORE_ID)
    .single();
  if (error || !data) throw new Error("store load failed: " + error?.message);
  return data;
}

async function run(
  label: string,
  ctx: AgentContext,
  history: Turn[]
): Promise<string> {
  console.log(`\n${"=".repeat(70)}\n${label}\n${"=".repeat(70)}`);
  for (const m of history) {
    console.log(`${m.role === "user" ? "CUSTOMER" : "AI"}: ${m.content}`);
  }
  const reply = await runSalesAgent(ctx, history);
  console.log(`AI: ${reply}`);
  return reply;
}

async function main() {
  const store = await loadStore();
  const baseCtx: AgentContext = {
    store: store as AgentContext["store"],
    conversationId: FAKE_CONVERSATION_ID,
    customerPhone: FAKE_PHONE,
    customerId: null,
  };

  // 1. Greeting
  await run("1. Greeting (fresh conversation)", baseCtx, [
    { role: "user", content: "hi" },
  ]);

  // 2. Named product / SKU-ish ask
  await run("2. Named product ask", baseCtx, [
    { role: "user", content: "do you have any lamps?" },
  ]);

  // 3. Catalog browse (vague)
  await run("3. Vague browse intent", baseCtx, [
    { role: "user", content: "I want to buy something, what do you have?" },
  ]);

  // 4. Price objection right after a pitch
  await run("4. Price objection after pitch", baseCtx, [
    { role: "user", content: "do you have the radiant twist lamp?" },
    {
      role: "assistant",
      content:
        "[Ref: abc-123]\nRadiant Twist Lamp — Rs 4,250\n\nWant it? Share your phone & delivery address.",
    },
    { role: "user", content: "that's too expensive" },
  ]);

  // 5. Reorder / "same product" reference (the bug fixed earlier today)
  await run("5. Reorder same product reference", baseCtx, [
    { role: "user", content: "do you have the radiant twist lamp?" },
    {
      role: "assistant",
      content:
        "[Ref: abc-123]\nRadiant Twist Lamp — Rs 4,250\n\nWant it? Share your phone & delivery address.",
    },
    { role: "user", content: "yes I want it, name Uzair, phone 03254039356, address muhafiz town block D" },
    {
      role: "assistant",
      content:
        "Order #TEST123 confirmed! Total: Rs 4,250\n\nThanks, Uzair!",
    },
    { role: "user", content: "I want 3 more quantity of the same product" },
  ]);

  // 6. Checkout — partial info only (must NOT call create_draft_order yet)
  await run("6. Checkout with only phone, no address (should ask for address, not order)", baseCtx, [
    { role: "user", content: "do you have the radiant twist lamp?" },
    {
      role: "assistant",
      content:
        "[Ref: abc-123]\nRadiant Twist Lamp — Rs 4,250\n\nWant it? Share your phone & delivery address.",
    },
    { role: "user", content: "yes, my number is 03254039356" },
  ]);

  // 7. Order status lookup for a nonexistent order (error handling)
  await run("7. Order status — nonexistent order number", baseCtx, [
    { role: "user", content: "what's the status of order #99999999?" },
  ]);

  // 8. Human handoff request
  await run("8. Human handoff request", baseCtx, [
    { role: "user", content: "I want to talk to a real person please" },
  ]);

  // 9. Memory recall ("what was I looking at before")
  await run("9. Memory recall — what was I interested in before", baseCtx, [
    { role: "user", content: "hi, what was I interested in last time?" },
  ]);

  // 10. Deliberately ambiguous message — should ask for clarification, not guess
  await run("10. Ambiguous message (clarification test)", baseCtx, [
    { role: "user", content: "do the thing from before but different" },
  ]);

  console.log(`\n${"=".repeat(70)}\nDone. Checking for any test order artifacts to clean up...\n${"=".repeat(70)}`);

  const supabase = createAdminClient();
  const { data: testOrders } = await supabase
    .from("orders")
    .select("id, order_number, shipping_address, created_at")
    .eq("store_id", STORE_ID)
    .order("created_at", { ascending: false })
    .limit(20);

  const created = (testOrders ?? []).filter((o) => {
    const addr = o.shipping_address as { phone?: string } | null;
    return addr?.phone?.includes(FAKE_PHONE.slice(-8));
  });

  if (created.length) {
    console.log(`Found ${created.length} test order(s) created — deleting:`);
    for (const o of created) {
      console.log(`  - ${o.order_number} (${o.id})`);
      await supabase.from("orders").delete().eq("id", o.id);
    }
  } else {
    console.log("No test orders were created. Clean.");
  }

  const { data: testCustomers } = await supabase
    .from("customers")
    .select("id, phone")
    .eq("store_id", STORE_ID)
    .ilike("phone", `%${FAKE_PHONE.slice(-8)}%`);
  if (testCustomers?.length) {
    console.log(`Found ${testCustomers.length} test customer row(s) — deleting:`);
    for (const c of testCustomers) {
      await supabase.from("customers").delete().eq("id", c.id);
    }
  }
}

main().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(1);
});
