import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_ACTIVE_PROMPT_EXAMPLES } from "./types";

const cache = new Map<string, { section: string; fetchedAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export function invalidatePromptExamplesCache(storeId: string): void {
  cache.delete(storeId);
}

async function loadSuccessExamplesSection(storeId: string): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("prompt_examples")
    .select("transcript_snippet, objection_type")
    .eq("store_id", storeId)
    .eq("active", true)
    .order("promoted_at", { ascending: false })
    .limit(MAX_ACTIVE_PROMPT_EXAMPLES);

  if (!data?.length) return "";

  const blocks = data.map((ex) => {
    const objection = ex.objection_type || "none";
    return `EXAMPLE (objection: ${objection})\n${ex.transcript_snippet}`;
  });

  return `\n# SUCCESSFUL CONVERSATION EXAMPLES\nStudy the pacing and tone below — don't copy exact wording.\n\n${blocks.join("\n\n")}`;
}

export async function getSuccessExamplesSection(
  storeId: string
): Promise<string> {
  const hit = cache.get(storeId);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.section;
  }

  const section = await loadSuccessExamplesSection(storeId);
  cache.set(storeId, { section, fetchedAt: Date.now() });
  return section;
}
