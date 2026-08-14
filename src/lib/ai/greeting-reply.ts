import type { AgentContext } from "./sales-tools";

const GREETING_ONLY =
  /^(hi+|hey+|heya+|hello+|hola+|yo+|sup+|thanks+|thank\s*you+|ok+|okay+|yes+|no+|assalam+|salam+|assalamu+|good morning|good evening|good afternoon|good night)[\s!.?,]*$/i;

/** Whole-message greeting only — exact match, not "hey there" or "hi whats up". */
export function looksLikeExactGreetingOnly(text: string): boolean {
  return GREETING_ONLY.test(text.trim());
}

/** "How are you?" / small talk before sales — not a product lookup. */
export function looksLikeHowAreYou(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  return (
    /\bhow\s+(are\s+you|are\s+u|r\s+u|is\s+it\s+going|you\s+doing)\b/i.test(t) ||
    /\bhow('s|s)\s+(it\s+going|things|your\s+day|everything)\b/i.test(t) ||
    /\bhow\s+(you|u)\s+doing\b/i.test(t)
  );
}

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
  // "who are you" / "tell me who are you" — identity, not product pick
  if (
    /\b(who\s+(are|r)\s+(you|u)|who\s+is\s+this|tell\s+me\s+who\s+(you\s+are|are\s+you)|what(?:'s| is)\s+your\s+name)\b/i.test(
      t
    )
  ) {
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
    `Hi! I'm ${agent} at ${store} — send me a product name or SKU and I'll share prices & details.`,
    `Hey, good to hear from you! I'm ${agent} from ${store} — what can I help you find today?`,
  ];
  const idx = Math.abs(store.length + agent.length) % variants.length;
  return variants[idx]!;
}

export function buildHowAreYouReply(ctx: AgentContext): string {
  const store = storeLabel(ctx);
  const agent = agentLabel(ctx, store);
  const variants = [
    `I'm doing well, thanks for asking! 😊 How about you? If you need anything from ${store}, just tell me what you're looking for.`,
    `All good here, thank you! ${agent} from ${store} — how are you doing today? Happy to help you find something to order.`,
    `I'm fine, thanks! Hope you're doing great too 🙌 Need any products from ${store}? Send a name or SKU and I'll help.`,
  ];
  const idx = Math.abs(store.length + agent.length + 1) % variants.length;
  return variants[idx]!;
}

export function tryDirectGreetingReply(
  ctx: AgentContext,
  latestUserMessage: string
): string | null {
  if (looksLikeHowAreYou(latestUserMessage)) {
    return buildHowAreYouReply(ctx);
  }
  if (!looksLikeExactGreetingOnly(latestUserMessage)) return null;
  return buildCasualGreetingReply(ctx);
}

/** Identity / joke reply — not a product SKU lookup. Never say AI/bot. */
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
  // Identity questions ("who are you", "are you AI?", etc.)
  return `I'm ${agent} from ${store} — here to help with products, prices, and orders. What are you looking for?`;
}
