import type { AgentContext } from "./sales-tools";

const GREETING_ONLY =
  /^(hi+|hey+|heya+|hello+|hola+|yo+|sup+|assalam+|salam+|assalamu+|good morning|good evening|good afternoon|good night)([\s,!.?-]*(again|back|there|bro|sis|friend))?[\s!.?,]*$/i;

/** Whole-message greeting only — exact match, not "hey there whats the price". */
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

/** Casual openers that are not product lookups — "hi whats up", "hey again", "heyyy", etc. */
export function looksLikeCasualGreeting(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (GREETING_ONLY.test(t)) return true;
  if (
    /^(hi+|hey+|heya+|hello+|salam+|assalam+)\s*(again|back)?[\s!.?,]*$/i.test(t)
  ) {
    return true;
  }
  if (/^(what'?s? up|whatsa? up|sup+|yo+|howdy|how are you|how r u|how are u)[\s!.?,]*$/i.test(t)) {
    return true;
  }
  if (
    /^(hi+|hello+|hey+|heya+|salam+|assalam+|assalamu+|good morning|good evening|good afternoon)\b[\s,!.?-]*(again|back|there|how are you|what'?s? up|whatsa? up|how r u|friend|bro|sis)?[\s!.?,]*$/i.test(
      t
    )
  ) {
    return true;
  }
  if (/^hi[\s,!.]*(what'?s? up|whatsa? up|how are you|there|again)/i.test(t)) return true;
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

/** True once we've already replied in this chat — don't spam opening/intro again. */
export function assistantAlreadyWelcomed(
  history: Array<{ role: "user" | "assistant"; content: string }>
): boolean {
  return history.some((m) => m.role === "assistant" && m.content.trim().length > 0);
}

/** First welcome — introduce once. */
export function buildCasualGreetingReply(ctx: AgentContext): string {
  const store = storeLabel(ctx);
  const agent = agentLabel(ctx, store);
  const variants = [
    `Hey 👋 ${agent} here from ${store}. Ask me a product name and I'll show you.`,
    `Hi! I'm ${agent} at ${store} — tell me which product you want and I'll show you.`,
    `Hey, good to hear from you! I'm ${agent} from ${store} — ask me a product and I'll show you.`,
  ];
  const idx = Math.abs(store.length + agent.length) % variants.length;
  return variants[idx]!;
}

/** Repeat hi/hey — do not re-send opening; wait for a real question. */
export function buildWaitingForQuestionReply(): string {
  return "How can I help you? Ask me a product name when you're ready 🙂";
}

export function buildHowAreYouReply(ctx: AgentContext): string {
  const store = storeLabel(ctx);
  const agent = agentLabel(ctx, store);
  const variants = [
    `I'm doing well, thanks! How can I help you today?`,
    `All good here — thanks for asking. How can I help you?`,
    `I'm fine, thanks! ${agent} here — how can I help you?`,
  ];
  const idx = Math.abs(store.length + agent.length + 1) % variants.length;
  return variants[idx]!;
}

/**
 * Greeting handler. First hi → short welcome.
 * Hello/hey again and again → one short "How can I help you?" — never spam opening.
 */
export function tryDirectGreetingReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): string | null {
  const isHowAreYou = looksLikeHowAreYou(latestUserMessage);
  const isGreeting =
    looksLikeExactGreetingOnly(latestUserMessage) ||
    looksLikeCasualGreeting(latestUserMessage);

  if (!isHowAreYou && !isGreeting) return null;

  // Already welcomed (or customer keeps saying hi) → don't re-introduce
  if (assistantAlreadyWelcomed(history)) {
    return buildWaitingForQuestionReply();
  }

  if (isHowAreYou) {
    return buildHowAreYouReply(ctx);
  }

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
    return `Ha — I'm ${agent} from ${store}, better at orders than comedy 😄 How can I help you?`;
  }
  return `I'm ${agent} from ${store} — here to help with products, prices, and orders. How can I help you?`;
}
