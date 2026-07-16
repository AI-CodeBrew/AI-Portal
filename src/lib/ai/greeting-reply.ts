import type { AgentContext } from "./sales-tools";

const GREETING_ONLY =
  /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|assalam|salam|assalamu|good morning|good evening|good afternoon|good night)[\s!.?,]*$/i;

/** Casual openers that are not product lookups — "hi whats up", "hey there", etc. */
export function looksLikeCasualGreeting(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (GREETING_ONLY.test(t)) return true;
  if (/^(what'?s? up|whatsa? up|sup|yo|howdy|how are you|how r u|how are u)[\s!.?,]*$/i.test(t)) {
    return true;
  }
  if (
    /^(hi|hello|hey|salam|assalam|assalamu|good morning|good evening|good afternoon)\b[\s,!.?-]*(there|how are you|what'?s? up|whatsa? up|how r u|friend|bro|sis)?[\s!.?,]*$/i.test(
      t
    )
  ) {
    return true;
  }
  if (/^hi[\s,!.]*(what'?s? up|whatsa? up|how are you|there)/i.test(t)) return true;
  return false;
}

function storeLabel(ctx: AgentContext): string {
  return (
    ctx.store.store_name ||
    ctx.store.shop_domain?.replace(/\.myshopify\.com$/i, "") ||
    "our store"
  );
}

function agentLabel(ctx: AgentContext, store: string): string {
  return ctx.aiConfig?.agentName?.trim() || store;
}

/** Short human greeting — no SKU bot voice. */
export function buildCasualGreetingReply(ctx: AgentContext): string {
  const store = storeLabel(ctx);
  const agent = agentLabel(ctx, store);
  const variants = [
    `Hey 👋 ${agent} here from ${store}. What product are you looking for?`,
    `Hi! I'm ${agent} at ${store} — send me a product name or SKU and I'll check price & stock for you.`,
    `Hey, good to hear from you! I'm ${agent} from ${store} — what can I help you find today?`,
  ];
  const idx = Math.abs(store.length + agent.length) % variants.length;
  return variants[idx]!;
}

export function tryDirectGreetingReply(
  ctx: AgentContext,
  latestUserMessage: string
): string | null {
  if (!looksLikeCasualGreeting(latestUserMessage)) return null;
  return buildCasualGreetingReply(ctx);
}
