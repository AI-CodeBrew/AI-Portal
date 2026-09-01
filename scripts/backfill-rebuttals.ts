/**
 * Backfill the rebuttals library from existing WhatsApp history.
 *
 * Walks past conversations, finds inbound messages that look like objections,
 * pairs each with the AI's next reply, dedupes, and inserts them as *pending*
 * rows for admin review at /admin/rebuttals. Nothing is auto-approved.
 *
 * Dry run (default — writes nothing):
 *   npm run backfill:rebuttals
 * Apply:
 *   npm run backfill:rebuttals -- --apply --limit=25
 *
 * Flags:
 *   --apply          actually insert (default is dry run)
 *   --limit=N        max rows to seed            (default 25)
 *   --store=<uuid>   only this store             (default all)
 *   --days=N         only conversations this recent (default 90)
 *   --delay=MS       pause between embed calls   (default 6000)
 *
 * Embedding quota is the bottleneck, not the DB — gemini-embedding-001 rate
 * limits aggressively. Keep --limit small and --delay generous, or raise the
 * quota first.
 */
import { createClient } from "@supabase/supabase-js";
import { looksLikeObjection } from "@/lib/ai/sales-recovery";
import { stripInternalAiMarkers } from "@/lib/ai/message-markers";
import { embedRebuttalText } from "@/lib/rebuttals/embeddings";
import { REBUTTAL_NOVELTY_THRESHOLD } from "@/lib/rebuttals/rebuttals-service";

function flag(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
}

/** `||` would swallow a deliberate 0 (e.g. --delay=0). */
function numFlag(name: string, fallback: number, min: number): number {
  const raw = Number(flag(name, String(fallback)));
  return Math.max(min, Number.isFinite(raw) ? raw : fallback);
}

const APPLY = process.argv.includes("--apply");
const LIMIT = numFlag("limit", 25, 1);
const STORE = flag("store", "");
const DAYS = numFlag("days", 90, 1);
const DELAY_MS = numFlag("delay", 6000, 0);

const MIN_OBJECTION_CHARS = 8;
const MAX_OBJECTION_CHARS = 500;
const MIN_ANSWER_CHARS = 20;
const FALLBACK_REPLY =
  /team member will jump in|our team will respond|someone from our team will message|not delivered to whatsapp/i;

/**
 * A rebuttal answer must be reusable prose. Product pitches and catalog lists
 * are not: their prices go stale, and an approved rebuttal quoting an old price
 * would make the agent repeat it instead of reading the live catalog. Prices
 * always come from tools at runtime — never from the library.
 */
const PRICE_IN_ANSWER = /(?:Rs\.?|PKR|AED|USD|SAR|\$|€)\s*[\d,]+/i;
const CATALOG_LIST_ANSWER =
  /here are a couple|say \*?more\*? or \*?other\*?|which one interests you|\[Ref:/i;

/** Clarification / disambiguation prompts answer nothing — they ask. */
const CLARIFYING_ANSWER =
  /did you mean|reply with the product name|couldn'?t find that product|which one did you mean|send the name or sku|what product can i help/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cos = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

/** embedRebuttalText soft-fails to null on 429 — retry with backoff. */
async function embedWithRetry(text: string): Promise<number[] | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const vec = await embedRebuttalText(text, "RETRIEVAL_QUERY");
    if (vec) return vec;
    const backoff = DELAY_MS * (attempt + 2);
    console.log(`      … embed returned null, retrying in ${backoff}ms`);
    await sleep(backoff);
  }
  return null;
}

type Candidate = {
  storeId: string;
  conversationId: string;
  objection: string;
  answer: string;
  createdAt: string;
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();

  console.log(
    `\n${APPLY ? "APPLY" : "DRY RUN"} · limit=${LIMIT} · days=${DAYS} · delay=${DELAY_MS}ms${STORE ? ` · store=${STORE}` : ""}\n`
  );

  // 1. Conversations in range
  let convQuery = supabase
    .from("whatsapp_conversations")
    .select("id, store_id")
    .gte("updated_at", since);
  if (STORE) convQuery = convQuery.eq("store_id", STORE);

  const { data: conversations, error: convErr } = await convQuery;
  if (convErr) {
    console.error("Could not load conversations:", convErr.message);
    process.exit(1);
  }
  if (!conversations?.length) {
    console.log("No conversations in range.");
    return;
  }
  console.log(`Scanning ${conversations.length} conversations…`);

  // 2. Pair each objection with the AI's next reply
  const candidates: Candidate[] = [];
  const seenInBatch = new Set<string>();

  for (const conv of conversations) {
    if (!conv.store_id) continue;

    const { data: messages } = await supabase
      .from("whatsapp_messages")
      .select("direction, content, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });

    if (!messages?.length) continue;

    for (let i = 0; i < messages.length - 1; i++) {
      const msg = messages[i];
      if (msg.direction !== "in") continue;

      const objection = (msg.content ?? "").trim();
      if (
        objection.length < MIN_OBJECTION_CHARS ||
        objection.length > MAX_OBJECTION_CHARS ||
        !looksLikeObjection(objection)
      ) {
        continue;
      }

      const next = messages[i + 1];
      if (next.direction !== "out") continue;

      // Stored outbound content keeps internal markers — strip for review.
      const answer = stripInternalAiMarkers(next.content ?? "").trim();
      if (
        answer.length < MIN_ANSWER_CHARS ||
        FALLBACK_REPLY.test(answer) ||
        PRICE_IN_ANSWER.test(answer) ||
        CATALOG_LIST_ANSWER.test(answer) ||
        CLARIFYING_ANSWER.test(answer)
      ) {
        continue;
      }

      // Cheap in-batch dedupe on exact text before spending any embed calls.
      const key = `${conv.store_id}:${normalize(objection)}`;
      if (seenInBatch.has(key)) continue;
      seenInBatch.add(key);

      candidates.push({
        storeId: conv.store_id,
        conversationId: conv.id,
        objection,
        answer,
        createdAt: next.created_at ?? new Date().toISOString(),
      });
    }
  }

  console.log(`Found ${candidates.length} objection turns.\n`);
  if (!candidates.length) return;

  // Newest first — recent objections are the ones worth answering.
  candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // 3. Embed + dedupe (against the DB, and against this run) + insert
  const acceptedVectors: Array<{ storeId: string; vec: number[] }> = [];
  let warnedNoTable = false;
  let seeded = 0;
  let skippedDup = 0;
  let skippedEmbed = 0;

  for (const c of candidates) {
    if (seeded >= LIMIT) {
      console.log(`\nReached --limit=${LIMIT}. Re-run to continue.`);
      break;
    }

    console.log(`  "${c.objection.slice(0, 70)}"`);

    const vec = await embedWithRetry(c.objection);
    if (!vec) {
      skippedEmbed++;
      console.log("      ✗ no embedding (quota?) — skipped");
      continue;
    }

    // Dedupe against rows already accepted in this run (free, no API call).
    const dupInRun = acceptedVectors.some(
      (a) =>
        (a.storeId === c.storeId || a.storeId === "") &&
        cos(a.vec, vec) >= REBUTTAL_NOVELTY_THRESHOLD
    );
    if (dupInRun) {
      skippedDup++;
      console.log("      → near-duplicate of one already seeded this run");
      continue;
    }

    // Dedupe against what is already in the library.
    const { data: existing, error: matchErr } = await supabase.rpc(
      "match_rebuttals",
      {
        query_embedding: vec,
        p_store_id: c.storeId,
        match_threshold: REBUTTAL_NOVELTY_THRESHOLD,
        match_count: 1,
        p_statuses: ["approved", "pending", "rejected"],
      }
    );
    if (matchErr) {
      // Dry run should still preview candidates before 045 is applied; an
      // apply run cannot proceed without the table.
      if (!APPLY) {
        if (!warnedNoTable) {
          console.log(
            "      ! sales_rebuttals not reachable — previewing without DB dedupe"
          );
          warnedNoTable = true;
        }
      } else {
        console.error(`      ✗ match_rebuttals failed: ${matchErr.message}`);
        console.error("        (has migration 045 been applied?)");
        process.exit(1);
      }
    }
    if (existing?.length) {
      skippedDup++;
      console.log("      → already in the library");
      continue;
    }

    if (APPLY) {
      const { error: insErr } = await supabase.from("sales_rebuttals").insert({
        store_id: c.storeId,
        status: "pending",
        source: "auto",
        objection_text: c.objection,
        answer_text: c.answer,
        embedding: vec,
        source_conversation_id: c.conversationId,
      });
      if (insErr) {
        console.error(`      ✗ insert failed: ${insErr.message}`);
        continue;
      }
    }

    acceptedVectors.push({ storeId: c.storeId, vec });
    seeded++;
    console.log(`      ↳ answer: "${c.answer.replace(/\s+/g, " ").slice(0, 90)}"`);
    console.log(`      ✓ ${APPLY ? "seeded" : "would seed"} (${seeded}/${LIMIT})`);

    if (DELAY_MS) await sleep(DELAY_MS);
  }

  console.log(
    `\n${APPLY ? "Seeded" : "Would seed"}: ${seeded}   duplicates skipped: ${skippedDup}   no embedding: ${skippedEmbed}`
  );
  if (!APPLY) console.log("\nDry run — nothing written. Re-run with --apply.");
  else console.log("\nReview them at /admin/rebuttals (Pending tab).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
