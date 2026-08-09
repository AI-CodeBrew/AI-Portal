/** Rough token estimate (~4 chars/token). Good enough for compaction triggers. */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateHistoryTokens(
  history: Array<{ role: string; content: string }>
): number {
  let total = 0;
  for (const m of history) {
    total += estimateTokens(m.content) + 4; // role overhead
  }
  return total;
}
