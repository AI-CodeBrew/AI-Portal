import { createAdminClient } from "@/lib/supabase/admin";
import { formatTranscriptSnippet } from "./transcript";
import { invalidatePromptExamplesCache } from "./prompt-examples-cache";
import { MAX_ACTIVE_PROMPT_EXAMPLES } from "./types";

export async function promoteOutcomeToExample(
  storeId: string,
  outcomeId: string
): Promise<
  | { ok: true; exampleId: string; deactivatedId: string | null }
  | { ok: false; error: string }
> {
  const supabase = createAdminClient();

  const { data: outcome, error: outcomeError } = await supabase
    .from("conversation_outcomes")
    .select("id, store_id, conversation_id, objection_type")
    .eq("id", outcomeId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (outcomeError) return { ok: false, error: outcomeError.message };
  if (!outcome?.conversation_id) {
    return { ok: false, error: "Outcome not found" };
  }

  const { data: messages, error: msgError } = await supabase
    .from("whatsapp_messages")
    .select("direction, content")
    .eq("conversation_id", outcome.conversation_id)
    .order("created_at", { ascending: true });

  if (msgError) return { ok: false, error: msgError.message };
  if (!messages?.length) {
    return { ok: false, error: "No transcript for this conversation" };
  }

  const snippet = formatTranscriptSnippet(
    messages as Array<{ direction: string; content: string }>
  );

  const { data: activeRows } = await supabase
    .from("prompt_examples")
    .select("id, promoted_at")
    .eq("store_id", storeId)
    .eq("active", true)
    .order("promoted_at", { ascending: true });

  let deactivatedId: string | null = null;
  if ((activeRows?.length ?? 0) >= MAX_ACTIVE_PROMPT_EXAMPLES) {
    const oldest = activeRows![0];
    const { error: deactivateError } = await supabase
      .from("prompt_examples")
      .update({ active: false })
      .eq("id", oldest.id)
      .eq("store_id", storeId);

    if (deactivateError) {
      return { ok: false, error: deactivateError.message };
    }
    deactivatedId = oldest.id as string;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("prompt_examples")
    .insert({
      store_id: storeId,
      conversation_id: outcome.conversation_id,
      outcome_id: outcome.id,
      transcript_snippet: snippet,
      objection_type: outcome.objection_type,
      active: true,
    })
    .select("id")
    .single();

  if (insertError) return { ok: false, error: insertError.message };

  invalidatePromptExamplesCache(storeId);

  return {
    ok: true,
    exampleId: inserted.id as string,
    deactivatedId,
  };
}

export async function setPromptExampleActive(
  storeId: string,
  exampleId: string,
  active: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();

  if (active) {
    const { data: activeRows } = await supabase
      .from("prompt_examples")
      .select("id")
      .eq("store_id", storeId)
      .eq("active", true);

    const alreadyActive = activeRows?.some((r) => r.id === exampleId);
    if (
      !alreadyActive &&
      (activeRows?.length ?? 0) >= MAX_ACTIVE_PROMPT_EXAMPLES
    ) {
      return {
        ok: false,
        error: `Maximum ${MAX_ACTIVE_PROMPT_EXAMPLES} active examples. Deactivate one first.`,
      };
    }
  }

  const { error } = await supabase
    .from("prompt_examples")
    .update({ active })
    .eq("id", exampleId)
    .eq("store_id", storeId);

  if (error) return { ok: false, error: error.message };

  invalidatePromptExamplesCache(storeId);
  return { ok: true };
}
