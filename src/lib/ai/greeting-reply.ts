import type { AgentContext } from "./sales-tools";

const GREETING_ONLY =
  /^(hi+|hey+|heya+|hello+|hola+|yo+|sup+|thanks+|thank\s*you+|ok+|okay+|yes+|no+|assalam+|salam+|assalamu+|good morning|good evening|good afternoon|good night)[\s!.?,]*$/i;

/** Casual openers that are not product lookups — "hi whats up", "hey there", "heyyy", etc. */
export function looksLikeCasualGreeting(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (GREETING_ONLY.test(t)) return true;
  if (/^(what'?s? up|whatsa? up|sup+|yo+|howdy|how are you|how r u|how are u)[\s!.?,]*$/i.test(t)) {
    return true;
  }
  if (
    /^(hi+|hello+|hey+|heya+|salam+|assalam+|assalamu+|good morning|good evening|good afternoon)\b[\s,!.?-]*(there|how are you|what'?s? up|whatsa? up|how r u|friend|bro|sis)?[\s!.?,]*$/i.test(
      t
    )
  ) {
    return true;
  }
  if (/^hi[\s,!.]*(what'?s? up|whatsa? up|how are you|there)/i.test(t)) return true;
  return false;
}

/** Meta / chitchat — not catalog or checkout. */
export function looksLikeOffTopicChat(text: string): boolean {
  const t = text.trim();
  if (t.length < 3) return false;
  if (
    /\b(are you|you're|u r|r u)\s+(an?\s+)?(ai|a bot|bot|robot|real person|human)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (/\b(tell me (a|about)?\s*(joke|funny|story)|say something funny)\b/i.test(t)) {
    return true;
  }
  if (/\b(who (made|built|created) you|what are you|are you real)\b/i.test(t)) {
    return true;
  }
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

/** Honest reply to "are you AI?", jokes, etc. — not a product SKU lookup. */
export function tryDirectOffTopicReply(
  ctx: AgentContext,
  latestUserMessage: string
): string | null {
  if (!looksLikeOffTopicChat(latestUserMessage)) return null;
  const store = storeLabel(ctx);
  const agent = agentLabel(ctx, store);
  const t = latestUserMessage.trim();

  if (/\bjoke\b/i.test(t)) {
    return `Ha — I'm ${agent} from ${store}, better at orders than comedy 😄 Need anything from the catalog?`;
  }
  if (/\b(are you|you're).*\b(ai|bot|robot)\b/i.test(t)) {
    return `I'm ${agent}, the ${store} assistant on WhatsApp — I help with products, prices, and placing orders. What can I look up for you?`;
  }
  return `I'm here to help with ${store} products and orders — what would you like to check?`;
}
