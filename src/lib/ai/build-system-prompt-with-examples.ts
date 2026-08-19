import { buildSalesSystemPrompt } from "./build-system-prompt";
import type { ResolvedStoreAiConfig } from "./ai-settings-types";
import type { AdProductContext } from "@/lib/ads/types";
import type { AgentMemoryContext } from "@/lib/memory/types";

type HistoryMessage = { role: "user" | "assistant"; content: string };

export async function buildSalesSystemPromptWithExamples(params: {
  storeId: string;
  storeLabel: string;
  storeCurrency?: string | null;
  aiConfig?: ResolvedStoreAiConfig | null;
  adProductContext?: AdProductContext | null;
  pendingOrdersHint?: string | null;
  history?: HistoryMessage[];
  memoryContext?: AgentMemoryContext | null;
}): Promise<string> {
  return buildSalesSystemPrompt({
    storeLabel: params.storeLabel,
    storeCurrency: params.storeCurrency,
    aiConfig: params.aiConfig,
    adProductContext: params.adProductContext,
    pendingOrdersHint: params.pendingOrdersHint,
    history: params.history,
    successExamplesSection: null,
    memoryContext: params.memoryContext,
  });
}
