/**
 * Backfill orders.conversation_id for orders created before the link existed.
 *
 * Orders are keyed to a customer upserted on the phone typed at checkout, which
 * is often NOT the number the customer chats from — so customer_id cannot be
 * trusted to find the chat. Two signals that do work, in priority order:
 *
 *   1. checkout phone appears in the chat's own messages (the customer typed it)
 *   2. the chat has a message within ±2 minutes of the order being created
 *      (the agent confirms the order immediately after creating it)
 *
 * Dry run (default):  npm run backfill:order-chats
 * Apply:              npm run backfill:order-chats -- --apply
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

const APPLY = process.argv.includes("--apply");
const WINDOW_MS = 120_000;

type ShippingAddress = { phone?: string } | null;

async function main() {
  const supabase = createAdminClient();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, store_id, order_number, created_at, shipping_address, customer_id")
    .is("conversation_id", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Could not load orders:", error.message);
    console.error("(has migration 046 been applied?)");
    process.exit(1);
  }
  if (!orders?.length) {
    console.log("No unlinked orders.");
    return;
  }

  console.log(`\n${APPLY ? "APPLY" : "DRY RUN"} · ${orders.length} unlinked orders\n`);

  let byPhone = 0;
  let byTime = 0;
  let unmatched = 0;

  for (const order of orders) {
    const shipping = order.shipping_address as ShippingAddress;
    const checkoutPhone = normalizePhone(shipping?.phone ?? "");
    let conversationId: string | null = null;
    let how = "";

    // 1. The chat where the customer typed this phone number
    if (checkoutPhone.length >= 9) {
      const suffix = checkoutPhone.slice(-9);
      const { data: msgs } = await supabase
        .from("whatsapp_messages")
        .select("conversation_id")
        .ilike("content", `%${suffix}%`)
        .limit(50);

      const convIds = [...new Set((msgs ?? []).map((m) => m.conversation_id))];
      if (convIds.length > 0) {
        const { data: convs } = await supabase
          .from("whatsapp_conversations")
          .select("id")
          .eq("store_id", order.store_id)
          .in("id", convIds)
          .limit(2);
        // Only trust it when exactly one chat in this store mentions the number
        if (convs?.length === 1) {
          conversationId = convs[0].id;
          how = "checkout phone in chat";
        }
      }
    }

    // 2. The chat that was active when the order was created
    if (!conversationId) {
      const t = new Date(order.created_at as string).getTime();
      const { data: near } = await supabase
        .from("whatsapp_messages")
        .select("conversation_id")
        .gte("created_at", new Date(t - WINDOW_MS).toISOString())
        .lte("created_at", new Date(t + WINDOW_MS).toISOString())
        .limit(200);

      const convIds = [...new Set((near ?? []).map((m) => m.conversation_id))];
      if (convIds.length > 0) {
        const { data: convs } = await supabase
          .from("whatsapp_conversations")
          .select("id")
          .eq("store_id", order.store_id)
          .in("id", convIds)
          .limit(2);
        if (convs?.length === 1) {
          conversationId = convs[0].id;
          how = "active chat at order time";
        }
      }
    }

    if (!conversationId) {
      unmatched++;
      console.log(`  ${order.order_number}  → no confident match, skipped`);
      continue;
    }

    if (how.startsWith("checkout")) byPhone++;
    else byTime++;

    if (APPLY) {
      const { error: updErr } = await supabase
        .from("orders")
        .update({ conversation_id: conversationId })
        .eq("id", order.id);
      if (updErr) {
        console.error(`  ${order.order_number}  ✗ ${updErr.message}`);
        continue;
      }
    }
    console.log(`  ${order.order_number}  → ${conversationId}  (${how})`);
  }

  console.log(
    `\n${APPLY ? "Linked" : "Would link"}: ${byPhone + byTime}  (phone: ${byPhone}, time: ${byTime})   unmatched: ${unmatched}`
  );
  if (!APPLY) console.log("\nDry run — nothing written. Re-run with --apply.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
