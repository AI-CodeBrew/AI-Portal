import { runSalesAgentWithGroq } from "./groq-agent";
import { runSalesAgentWithAnthropic } from "./anthropic-agent";
import { getShopCurrency } from "@/lib/shopify";
import { resolveStoreAiConfig } from "./store-ai-settings";
import {
  getPendingOrdersHintForPhone,
  type AgentContext,
} from "./sales-tools";
import { tryDirectProductReply } from "./product-reply";
import { tryDirectCheckoutReply } from "./checkout-reply";
import { tryDirectSalesRecoveryReply } from "./sales-recovery";

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

  if (next.pendingOrdersHint == null) {
    try {
      const pendingOrdersHint = await getPendingOrdersHintForPhone(
        next.store.id,
        next.customerPhone
      );
      next = { ...next, pendingOrdersHint };
    } catch (err) {
      console.error("[run-sales-agent] pending orders hint failed:", err);
    }
  }

  return next;
}

export async function runSalesAgent(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const enrichedCtx = await enrichAgentContext(ctx);
  const latestUser =
    [...history].reverse().find((m) => m.role === "user")?.content ?? "";

  // Place-order + name/phone/address → create & confirm before the LLM
  try {
    const checkout = await tryDirectCheckoutReply(
      enrichedCtx,
      latestUser,
      history
    );
    if (checkout) return checkout;
  } catch (err) {
    console.error("[run-sales-agent] checkout failed:", err);
  }

  // Decline after product pitch → discount, then bundle, then stop
  try {
    const recovery = await tryDirectSalesRecoveryReply(
      enrichedCtx,
      latestUser,
      history
    );
    if (recovery) return recovery;
  } catch (err) {
    console.error("[run-sales-agent] sales recovery failed:", err);
  }

  // Catalog lookup by SKU or product name (incl. variants) before the LLM
  try {
    const direct = await tryDirectProductReply(enrichedCtx, latestUser);
    if (direct) return direct.reply;
  } catch (err) {
    console.error("[run-sales-agent] product prefetch failed:", err);
  }

  if (process.env.GROQ_API_KEY) {
    return runSalesAgentWithGroq(enrichedCtx, history);
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return runSalesAgentWithAnthropic(enrichedCtx, history);
  }

  return "Thanks for your message! Our AI sales agent is being configured. A team member will respond shortly.";
}
