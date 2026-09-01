/**
 * Retrieval + novel-objection capture for the admin-moderated rebuttals library.
 * Everything here soft-fails: a rebuttal is an enhancement to a reply, never a
 * precondition for one.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { embedRebuttalText } from "./embeddings";

/**
 * Thresholds calibrated against gemini-embedding-001 @768 with a real price
 * rebuttal as the DOCUMENT and 7 QUERY probes:
 *   same objection  0.690 – 0.798  ("too expensive", "bohot mehnga hai,
 *                                   discount do", "ye bohot costly hai yaar")
 *   other objection 0.544 – 0.579  (authenticity, warranty, delivery time)
 * The bands separate cleanly with a 0.111 gap, but both sit far below the
 * 0.8+ range one might assume — at 0.82 nothing would ever match, including a
 * verbatim restatement. Cross-language matters most here: Roman Urdu phrasings
 * of the same objection land ~0.73, so a high bar would silently disable the
 * feature for most of this audience.
 *
 * `[rebuttals] match … sim=` logs every hit — use real traffic to refine.
 */

/** Bar to MANDATE an approved answer. Sits mid-gap: 0.07 above the worst
 * unrelated objection, 0.04 below the weakest same-objection paraphrase. */
export const REBUTTAL_SERVE_THRESHOLD = 0.65;

/** Bar for "we already have this, don't queue it". Below serve on purpose: the
 * 0.60–0.65 grey zone is near-duplicates we weren't confident enough to serve,
 * and queuing those floods the admin with 40 phrasings of one objection.
 * Still above the 0.579 unrelated-objection ceiling, so genuinely new
 * objections are captured. Under-capturing is the right error. */
export const REBUTTAL_NOVELTY_THRESHOLD = 0.6;

const MIN_OBJECTION_CHARS = 8;
const MAX_OBJECTION_CHARS = 500;
const MIN_ANSWER_CHARS = 20;

export type MatchedRebuttal = {
  id: string;
  storeId: string | null;
  objectionText: string;
  answerText: string;
  similarity: number;
};

type MatchRow = {
  id: string;
  store_id: string | null;
  objection_text: string;
  answer_text: string;
  status: string;
  similarity: number;
};

/** Find the admin-approved answer for this objection, if one is close enough. */
export async function findMatchingRebuttal(
  storeId: string,
  objectionText: string
): Promise<MatchedRebuttal | null> {
  try {
    const vec = await embedRebuttalText(objectionText, "RETRIEVAL_QUERY");
    if (!vec) return null;

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("match_rebuttals", {
      query_embedding: vec,
      p_store_id: storeId,
      match_threshold: REBUTTAL_SERVE_THRESHOLD,
      match_count: 1,
      p_statuses: ["approved"],
    });

    if (error) {
      console.error("[rebuttals] match failed:", error.message);
      return null;
    }

    // The RPC already applied the threshold and store-over-global ordering.
    const row = (data as MatchRow[] | null)?.[0];
    if (!row) return null;

    console.log(
      `[rebuttals] match store=${storeId} sim=${row.similarity.toFixed(3)} id=${row.id}`
    );

    // Counter is not on the critical path — don't await.
    void supabase
      .rpc("increment_rebuttal_served", { p_id: row.id })
      .then(({ error: incErr }) => {
        if (incErr) {
          console.warn("[rebuttals] serve counter failed:", incErr.message);
        }
      });

    return {
      id: row.id,
      storeId: row.store_id,
      objectionText: row.objection_text,
      answerText: row.answer_text,
      similarity: row.similarity,
    };
  } catch (err) {
    console.warn(
      "[rebuttals] match error:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/** Queue a pending rebuttal only when the objection is genuinely novel. */
export async function captureRebuttalCandidate(params: {
  storeId: string;
  objectionText: string;
  draftAnswer: string;
  conversationId: string;
  metaMessageId?: string | null;
}): Promise<void> {
  const objection = params.objectionText.trim();
  const answer = params.draftAnswer.trim();

  if (
    objection.length < MIN_OBJECTION_CHARS ||
    objection.length > MAX_OBJECTION_CHARS ||
    answer.length < MIN_ANSWER_CHARS
  ) {
    return;
  }

  // Never queue a failure/handoff message as a draft rebuttal.
  if (
    /team member will jump in|our team will respond|someone from our team will message/i.test(
      answer
    )
  ) {
    return;
  }

  try {
    // Cache hit from the runtime lookup earlier in this same invocation.
    const vec = await embedRebuttalText(objection, "RETRIEVAL_QUERY");
    if (!vec) return;

    const supabase = createAdminClient();

    // Dedupe against approved (already covered), pending (already queued), and
    // rejected (admin already said no — don't re-ask).
    const { data, error } = await supabase.rpc("match_rebuttals", {
      query_embedding: vec,
      p_store_id: params.storeId,
      match_threshold: REBUTTAL_NOVELTY_THRESHOLD,
      match_count: 1,
      p_statuses: ["approved", "pending", "rejected"],
    });

    if (error) {
      console.warn("[rebuttals] dedupe failed:", error.message);
      return;
    }

    const existing = (data as MatchRow[] | null)?.[0];
    if (existing) return;

    const { error: insertError } = await supabase
      .from("sales_rebuttals")
      .insert({
        store_id: params.storeId,
        status: "pending",
        source: "auto",
        objection_text: objection,
        answer_text: answer,
        embedding: vec,
        source_conversation_id: params.conversationId,
        source_meta_message_id: params.metaMessageId ?? null,
      });

    if (insertError) {
      console.warn("[rebuttals] capture insert failed:", insertError.message);
      return;
    }

    console.log(
      `[rebuttals] captured novel objection store=${params.storeId} conversation=${params.conversationId}`
    );
  } catch (err) {
    console.warn(
      "[rebuttals] capture failed:",
      err instanceof Error ? err.message : err
    );
  }
}
