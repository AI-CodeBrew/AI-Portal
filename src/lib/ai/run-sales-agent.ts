import { runSalesAgentWithGroq } from "./groq-agent";
import { runSalesAgentWithAnthropic } from "./anthropic-agent";
import { getShopCurrency } from "@/lib/shopify";
import { resolveStoreAiConfig } from "./store-ai-settings";
import type { AgentContext } from "./sales-tools";

export type { AgentContext } from "./sales-tools";

export function isSalesAgentConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY);
}

async function enrichAgentContext(ctx: AgentContext): Promise<AgentContext> {
  let next = ctx;

  if (!ctx.storeCurrency && ctx.store.shop_domain && ctx.store.shopify_access_token) {
    try {
      const storeCurrency = await getShopCurrency(
        ctx.store.shop_domain,
        ctx.store.shopify_access_token
      );
      next = { ...next, storeCurrency };
    } catch {
      // keep without currency
    }
  }

  if (!ctx.aiConfig) {
    try {
      const aiConfig = await resolveStoreAiConfig(ctx.store.id);
      next = { ...next, aiConfig };
    } catch (err) {
      console.error("[run-sales-agent] AI config load failed:", err);
    }
  }

  return next;
}

export async function runSalesAgent(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const enrichedCtx = await enrichAgentContext(ctx);

  if (process.env.GROQ_API_KEY) {
    return runSalesAgentWithGroq(enrichedCtx, history);
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return runSalesAgentWithAnthropic(enrichedCtx, history);
  }

  return "Thanks for your message! Our AI sales agent is being configured. A team member will respond shortly.";
}
