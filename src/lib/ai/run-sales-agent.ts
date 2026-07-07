import { runSalesAgentWithGroq } from "./groq-agent";
import { runSalesAgentWithAnthropic } from "./anthropic-agent";
import type { AgentContext } from "./sales-tools";

export type { AgentContext } from "./sales-tools";

export function isSalesAgentConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export async function runSalesAgent(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  if (process.env.GROQ_API_KEY) {
    return runSalesAgentWithGroq(ctx, history);
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return runSalesAgentWithAnthropic(ctx, history);
  }

  return "Thanks for your message! Our AI sales agent is being configured. A team member will respond shortly.";
}
