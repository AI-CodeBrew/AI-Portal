import type { AgentContext } from "./sales-tools";
import { findActiveProductContext } from "./product-reply";

/**
 * Trust / stall / process questions after a pitch — not catalog searches.
 * Photo requests stay on the image handler.
 */
export function looksLikePitchFollowupQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (looksLikeProfilePrefsDump(t)) return false;
  if (
    /\b(send|share|show)\b.*\b(photo|pic|image|picture)\b/i.test(t) ||
    /^(photo|pic|image)s?\??$/i.test(t)
  ) {
    return false;
  }
  return (
    /\b(original|genuine|copy|fake|warranty|guarantee)\b/i.test(t) ||
    /\b(quality|does it last|will it last|how long (does|will) it last)\b/i.test(
      t
    ) ||
    /\b(cod|cash on delivery)\b/i.test(t) ||
    /\bjust (looking|browsing)\b/i.test(t) ||
    /\b(website|web\s*site|send (me )?(the )?(link|url)|product link)\b/i.test(
      t
    ) ||
    /\bask (my )?(wife|husband|partner)\b/i.test(t)
  );
}

/** Name + city/COD/budget dump — not a COD checkout question. */
export function looksLikeProfilePrefsDump(text: string): boolean {
  const t = text.trim();
  return (
    /\bmy name is\b/i.test(t) &&
    /\b(live|prefer|budget|cod)\b/i.test(t)
  );
}

export function tryDirectProfilePrefsReply(latestUserMessage: string): string | null {
  if (!looksLikeProfilePrefsDump(latestUserMessage)) return null;
  return "Noted — name, city, and payment preference are saved. What product can I help you with?";
}

function productHint(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  latestUser: string
): string {
  const title = findActiveProductContext(history, latestUser)?.title?.trim();
  if (
    !title ||
    title.length < 4 ||
    /^(to|talk|human|please|it|this|that)$/i.test(title)
  ) {
    return "this one";
  }
  return `*${title}*`;
}

export function tryDirectPitchFollowupReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): string | null {
  if (!looksLikePitchFollowupQuestion(latestUserMessage)) return null;
  const t = latestUserMessage.trim();
  const product = productHint(history, latestUserMessage);
  const agent =
    ctx.aiConfig?.agentName?.trim() ||
    ctx.store.store_name?.replace(/\.myshopify\.com$/i, "") ||
    "Sales";

  if (/\b(original|genuine|copy|fake)\b/i.test(t)) {
    return `${product} is genuine stock from us — not a copy. Want me to lock it in? Share phone + address.`;
  }
  if (/\b(warranty|guarantee)\b/i.test(t)) {
    return `I don't invent warranty terms — if it's listed on the product I'll share it. For ${product}, want to go ahead and order?`;
  }
  if (/\b(quality|does it last|will it last|how long (does|will) it last)\b/i.test(t)) {
    return `${product} is solid quality for the price — built to last with normal use. Want this one, or should I show another option?`;
  }
  if (/\b(cod|cash on delivery)\b/i.test(t)) {
    return `Yes — COD is available. Share your *phone* and *delivery address* and I'll lock ${product} in.`;
  }
  if (/\bjust (looking|browsing)\b/i.test(t)) {
    return `No rush. I can keep ${product} here, or show something else — what would you like?`;
  }
  if (/\b(website|web\s*site|send (me )?(the )?(link|url)|product link)\b/i.test(t)) {
    return `I can send details and photos right here on WhatsApp. Want the photo of ${product}, or ready to order?`;
  }
  if (/\bask (my )?(wife|husband|partner)\b/i.test(t)) {
    return `Of course — take a minute. ${product} is here when you're ready. Want me to note COD + your city, or wait?`;
  }

  return `${agent} here — happy to help with ${product}. Want to order, or another question first?`;
}
