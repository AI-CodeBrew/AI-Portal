import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveLlmConfig } from "@/lib/platform/llm-settings";
import { getRecentChatHistory } from "@/lib/ai/chat-history";
import { MEMORY_DEFAULTS } from "./types";
import { estimateHistoryTokens, estimateTokens } from "./token-estimate";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export async function loadConversationSummary(conversationId: string): Promise<{
  rollingSummary: string | null;
  summaryUpdatedAt: string | null;
  historyTokenEstimate: number;
}> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("whatsapp_conversations")
      .select("rolling_summary, summary_updated_at, history_token_estimate")
      .eq("id", conversationId)
      .maybeSingle();

    return {
      rollingSummary: (data?.rolling_summary as string | null) ?? null,
      summaryUpdatedAt: (data?.summary_updated_at as string | null) ?? null,
      historyTokenEstimate: Number(data?.history_token_estimate ?? 0),
    };
  } catch (err) {
    console.warn("[compaction] load summary failed:", err);
    return {
      rollingSummary: null,
      summaryUpdatedAt: null,
      historyTokenEstimate: 0,
    };
  }
}

/** Update history_token_estimate every turn so compaction can fire. */
export async function updateHistoryTokenEstimate(
  conversationId: string,
  estimate: number
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from("whatsapp_conversations")
      .update({
        history_token_estimate: Math.max(0, Math.round(estimate)),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  } catch (err) {
    console.warn("[compaction] token estimate update failed:", err);
  }
}

async function summarizeOlderTurns(params: {
  apiKey: string;
  model: string;
  existingSummary: string | null;
  olderMessages: Array<{ role: string; content: string }>;
}): Promise<string | null> {
  const transcript = params.olderMessages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(0, 48_000);

  if (!transcript.trim()) return params.existingSummary;

  const prompt = `Compress this WhatsApp sales chat into a tight rolling summary for a sales agent.
Keep: customer name, language, products/SKUs discussed, prices quoted, objections, city/address hints, funnel stage, promises made.
Drop: greetings, filler, repeated pitches.
Max ~400 words. Merge with the existing summary if present.

Existing summary:
${params.existingSummary?.trim() || "(none)"}

Older messages:
${transcript}

Return ONLY the updated summary text.`;

  const url = `${GEMINI_API_BASE}/${encodeURIComponent(params.model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": params.apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!res.ok) {
    console.warn("[compaction] summarize failed:", res.status);
    return params.existingSummary;
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  return text || params.existingSummary;
}

export function compactionThresholdTokens(): number {
  return Math.floor(
    MEMORY_DEFAULTS.model_input_budget * MEMORY_DEFAULTS.compact_threshold_ratio
  );
}

function exactWindowFromBoundary(
  wide: Array<{ role: "user" | "assistant"; content: string; created_at?: string }>,
  summaryUpdatedAt: string | null,
  keep: number
): Array<{ role: "user" | "assistant"; content: string; created_at?: string }> {
  if (!summaryUpdatedAt) {
    return wide.slice(-Math.min(keep, wide.length));
  }
  const afterOrAt = wide.filter(
    (m) => (m.created_at ?? "") >= summaryUpdatedAt
  );
  if (afterOrAt.length >= keep) return afterOrAt;
  return wide.slice(-Math.min(keep, wide.length));
}

/**
 * When history exceeds ~70% of practical budget, summarize older turns and
 * keep the last keep_exact_turns verbatim.
 * `summary_updated_at` = created_at of the oldest kept message (exact-window boundary).
 */
export async function maybeCompactConversationHistory(params: {
  conversationId: string;
  sinceIso?: string | null;
  /** Force compact even if under threshold (e.g. resolver already decided). */
  force?: boolean;
}): Promise<boolean> {
  const { conversationId, sinceIso, force = false } = params;
  const threshold = compactionThresholdTokens();
  const keep = MEMORY_DEFAULTS.keep_exact_turns;

  const wideHistory = await getRecentChatHistory(
    conversationId,
    0,
    0,
    sinceIso
  );
  const summaryRow = await loadConversationSummary(conversationId);
  const exactForBudget = summaryRow.rollingSummary
    ? exactWindowFromBoundary(
        wideHistory,
        summaryRow.summaryUpdatedAt,
        keep
      )
    : wideHistory;
  const estimate =
    estimateHistoryTokens(exactForBudget) +
    estimateTokens(summaryRow.rollingSummary);

  await updateHistoryTokenEstimate(
    conversationId,
    estimateHistoryTokens(wideHistory) + estimateTokens(summaryRow.rollingSummary)
  );

  if (!force && estimate < threshold) {
    return false;
  }
  if (wideHistory.length <= keep) {
    return false;
  }

  const llm = await getActiveLlmConfig();
  if (!llm.geminiApiKey) return false;

  const older = wideHistory.slice(0, -keep);
  if (older.length < 4) return false;

  try {
    const newSummary = await summarizeOlderTurns({
      apiKey: llm.geminiApiKey,
      model: llm.geminiUtilityModel,
      existingSummary: summaryRow.rollingSummary,
      olderMessages: older,
    });

    if (!newSummary?.trim()) return false;

    const supabase = createAdminClient();
    const recentExact = wideHistory.slice(-keep);
    const boundaryIso =
      recentExact[0]?.created_at ?? new Date().toISOString();
    const newEstimate =
      estimateTokens(newSummary) + estimateHistoryTokens(recentExact);

    await supabase
      .from("whatsapp_conversations")
      .update({
        rolling_summary: newSummary.trim(),
        summary_updated_at: boundaryIso,
        history_token_estimate: newEstimate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
    return true;
  } catch (err) {
    console.warn("[compaction] compact failed:", err);
    return false;
  }
}

export type ResolvedAgentHistory = {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** 0 = full thread (no trim); else post-compact exact-window hint */
  historyLimit: number;
  rollingSummary: string | null;
  compacted: boolean;
};

/**
 * Pass all messages while under ~70% of the practical context budget.
 * When over: summarize previous chat, then send summary + last 20 exact
 * (exact window then grows with new messages until ~70% again).
 */
export async function resolveAgentChatHistory(params: {
  conversationId: string;
  sinceIso?: string | null;
}): Promise<ResolvedAgentHistory> {
  const { conversationId, sinceIso } = params;
  const keep = MEMORY_DEFAULTS.keep_exact_turns;
  const threshold = compactionThresholdTokens();

  let wide = await getRecentChatHistory(conversationId, 0, 0, sinceIso);
  let summaryRow = await loadConversationSummary(conversationId);

  const budgetEstimate = (summary: string | null, boundary: string | null) => {
    if (!summary) return estimateHistoryTokens(wide);
    const exact = exactWindowFromBoundary(wide, boundary, keep);
    return estimateTokens(summary) + estimateHistoryTokens(exact);
  };

  let estimate = budgetEstimate(
    summaryRow.rollingSummary,
    summaryRow.summaryUpdatedAt
  );
  await updateHistoryTokenEstimate(conversationId, estimate);

  // No summary yet and full thread fits — send everything.
  if (!summaryRow.rollingSummary && estimate <= threshold) {
    return {
      history: wide,
      historyLimit: 0,
      rollingSummary: null,
      compacted: false,
    };
  }

  // Over budget (or summary+exact window over budget) → compact.
  if (estimate > threshold) {
    await maybeCompactConversationHistory({
      conversationId,
      sinceIso,
      force: true,
    });
    wide = await getRecentChatHistory(conversationId, 0, 0, sinceIso);
    summaryRow = await loadConversationSummary(conversationId);
  }

  // After compact (or existing summary): summary + exact window since boundary.
  if (summaryRow.rollingSummary) {
    const history = exactWindowFromBoundary(
      wide,
      summaryRow.summaryUpdatedAt,
      keep
    );
    estimate =
      estimateTokens(summaryRow.rollingSummary) +
      estimateHistoryTokens(history);
    await updateHistoryTokenEstimate(conversationId, estimate);

    // Exact window grew past budget again — re-compact to last 20.
    if (estimate > threshold && wide.length > keep) {
      await maybeCompactConversationHistory({
        conversationId,
        sinceIso,
        force: true,
      });
      wide = await getRecentChatHistory(conversationId, 0, 0, sinceIso);
      summaryRow = await loadConversationSummary(conversationId);
      const trimmed = exactWindowFromBoundary(
        wide,
        summaryRow.summaryUpdatedAt,
        keep
      );
      return {
        history: trimmed,
        historyLimit: keep,
        rollingSummary: summaryRow.rollingSummary,
        compacted: true,
      };
    }

    return {
      history,
      historyLimit: keep,
      rollingSummary: summaryRow.rollingSummary,
      compacted: true,
    };
  }

  // Compact failed / unavailable — fall back to last 20.
  return {
    history: wide.slice(-Math.min(keep, wide.length)),
    historyLimit: keep,
    rollingSummary: null,
    compacted: false,
  };
}

/** Clear rolling summary on inbox session reset (profile kept). */
export async function clearConversationRollingSummary(
  conversationId: string
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from("whatsapp_conversations")
      .update({
        rolling_summary: null,
        summary_updated_at: null,
        history_token_estimate: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  } catch (err) {
    console.warn("[compaction] clear summary failed:", err);
  }
}

export async function clearRollingSummaryForPhone(
  storeId: string,
  customerPhone: string
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from("whatsapp_conversations")
      .update({
        rolling_summary: null,
        summary_updated_at: null,
        history_token_estimate: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("store_id", storeId)
      .eq("customer_phone", customerPhone);
  } catch (err) {
    console.warn("[compaction] clear summaries for phone failed:", err);
  }
}

export function formatRollingSummaryBlock(
  summary: string | null | undefined,
  maxTokens = MEMORY_DEFAULTS.summary_max_tokens
): string {
  const text = summary?.trim();
  if (!text) return "";
  let block = `# CONVERSATION SUMMARY\n${text}`;
  const maxChars = maxTokens * 4;
  if (block.length > maxChars) {
    block = block.slice(0, maxChars - 3) + "...";
  }
  return block;
}
