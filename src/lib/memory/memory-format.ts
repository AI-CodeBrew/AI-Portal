import {
  formatCustomerProfileBlock,
} from "./customer-profile";
import { formatRollingSummaryBlock } from "./conversation-compaction";
import type { AgentMemoryContext, RecalledMemory } from "./types";
import { MEMORY_DEFAULTS } from "./types";

/** Pure formatter — keep out of mem0-client so dashboard routes don't pull mem0ai. */
export function formatRecalledMemoriesBlock(
  memories: RecalledMemory[],
  maxTokens = MEMORY_DEFAULTS.recall_max_tokens
): string {
  if (!memories.length) return "";
  const lines = memories.map((m) => `- ${m.memory}`);
  let block = `# LONG-TERM MEMORY (recalled)\n${lines.join("\n")}`;
  const maxChars = maxTokens * 4;
  if (block.length > maxChars) {
    block = block.slice(0, maxChars - 3) + "...";
  }
  return block;
}

/** Build prompt blocks: profile + rolling summary + Mem0 recall only (no older DB dumps). */
export function formatMemoryPromptBlocks(
  memory: AgentMemoryContext | null | undefined
): string {
  if (!memory) return "";

  const parts = [
    formatCustomerProfileBlock(
      memory.profile,
      MEMORY_DEFAULTS.profile_max_tokens
    ),
    formatRollingSummaryBlock(
      memory.rollingSummary,
      MEMORY_DEFAULTS.summary_max_tokens
    ),
    formatRecalledMemoriesBlock(
      memory.recalledMemories,
      MEMORY_DEFAULTS.recall_max_tokens
    ),
  ].filter(Boolean);

  return parts.join("\n\n");
}
