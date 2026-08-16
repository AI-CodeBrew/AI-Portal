/** Shared memory-layer types and budgets. */

export const MEMORY_DEFAULTS = {
  /**
   * After compaction: keep this many trailing messages exact.
   * Before ~70% budget: send the full thread (up to fetch cap).
   */
  recent_turn_limit: 20,
  /** Keep this many exact turns when compacting older ones */
  keep_exact_turns: 20,
  /** Practical input budget for compaction (not full 1M context) */
  model_input_budget: 120_000,
  /** Compact when estimate exceeds this ratio of budget (~70%) */
  compact_threshold_ratio: 0.7,
  /** Soft cap for profile block in the system prompt */
  profile_max_tokens: 1200,
  /** Soft cap for rolling summary block */
  summary_max_tokens: 2000,
  /** Soft cap for Mem0 recall block */
  recall_max_tokens: 800,
  summarize_model_env: "GEMINI_UTILITY_MODEL",
} as const;

export type CustomerSalesProfile = {
  name: string | null;
  language: string | null;
  funnel_stage: string | null;
  budget_range: string | null;
  interested_products: string[];
  interested_skus: string[];
  objections: string[];
  last_order_summary: string | null;
  preferred_payment: string | null;
  agent_notes: string | null;
};

export type RecalledMemory = {
  id?: string;
  memory: string;
  score?: number;
};

export type AgentMemoryContext = {
  sessionKey: string;
  rollingSummary: string | null;
  summaryUpdatedAt: string | null;
  profile: CustomerSalesProfile | null;
  funnelStage: string | null;
  language: string | null;
  /** Effective verbatim history limit for this turn */
  historyLimit: number;
};

export function emptyProfile(): CustomerSalesProfile {
  return {
    name: null,
    language: null,
    funnel_stage: null,
    budget_range: null,
    interested_products: [],
    interested_skus: [],
    objections: [],
    last_order_summary: null,
    preferred_payment: null,
    agent_notes: null,
  };
}
