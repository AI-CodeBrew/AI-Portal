import { AI_SETTING_DEFAULTS } from "./ai-settings-types";
import { parseCheckoutDetails } from "./checkout-parse";

const DECLINE_PATTERN =
  /\b(don'?t\s+want|dont\s+want|do\s+not\s+want|not\s+(interested|now|today|ordering|buying|want)|no\s+thanks|no\s+thank\s+you|nah+|nope|not\s+for\s+me|maybe\s+later|later|skip|cancel|i'?ll\s+pass|no\s+order|won'?t\s+(order|buy)|not\s+going\s+to\s+(buy|order)|wnt\s+to\s+order|expens\w*|xpens\w*|costly|too\s+(much|pricey|costly)|(?:price|cost|rate)\s+(is\s+)?(too\s+)?high|high\s+(price|cost)|can'?t\s+afford|\bbudget\b|over\s+budget|out\s+of\s+(my\s+)?budget|overpriced|not\s+worth|discount|discounts|any\s+offers?|better\s+(price|deal|offer)|special\s+(price|offer|deal)|last\s+price|best\s+price|final\s+price|reduce\s+(the\s+)?price|lower\s+(the\s+)?price|cheaper|sasta|mehnga|mehngi|mehangi|mehanga|qeemat|bohot\s+(zyada|mehnga|mehngi)|offer\s+(me|please)|give\s+(me\s+)?(a\s+)?(discount|offer)|can\s+(you|u)\s+give|\d+\s*%\s*off|%\s*off|percent(?:age)?\s+off|bulk\s*(order|discount|deal|off|price)?|on\s+bulk)\b/i;

const HARD_STOP_PATTERN =
  /\b(stop\s+(messaging|texting|contacting)|unsubscribe|leave\s+me\s+alone|never\s+(message|contact)|block|spam)\b/i;

const MARKER_CLOSED = "[Deal closed]";

function lastAssistantMessages(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  n = 12
): string[] {
  return history
    .filter((m) => m.role === "assistant")
    .slice(-n)
    .map((m) => m.content);
}

function newestRecoveryOfferMessage(assistants: string[]): string | null {
  for (const content of [...assistants].reverse()) {
    if (
      /\[Deal\s+[12]\/2/i.test(content) ||
      /𝟮-𝗣𝗔𝗖𝗞|2-PACK|𝗕𝗨𝗡𝗗𝗟𝗘|𝗙𝗟𝗔𝗧.*𝗢𝗙𝗙|FLAT.*OFF/i.test(content)
    ) {
      return content;
    }
  }
  return null;
}

function percentFromOfferMessage(content: string, fallback: number): number {
  const marker =
    content.match(/\[Deal\s+[12]\/2[^\]]*?\b(\d{1,2})\s*%\s*off\]/i) ||
    content.match(/\b(\d{1,2})\s*%\s*off\b/i);
  const n = marker ? Number(marker[1]) : fallback;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isBundleOfferMessage(content: string): boolean {
  return (
    /\[Deal\s+2\/2/i.test(content) || /𝟮-𝗣𝗔𝗖𝗞|2-PACK|𝗕𝗨𝗡𝗗𝗟𝗘/i.test(content)
  );
}

function isDiscountOfferMessage(content: string): boolean {
  return /\[Deal\s+1\/2/i.test(content) || /𝗙𝗟𝗔𝗧|FLAT.*OFF/i.test(content);
}

/** Detect an open recovery offer in chat (for checkout discount + qty).
 * Used by the manual-order inbox UI (not the AI sales agent, which now
 * relies on the LLM reading discount context from chat history directly). */
export function getPendingRecoveryOffer(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  defaults?: { discount?: number; bundle?: number }
): { type: "discount" | "bundle"; percent: number; defaultQty: number } | null {
  const assistants = lastAssistantMessages(history, 8);
  const recent = assistants.join("\n");
  if (recent.includes(MARKER_CLOSED)) return null;

  const defaultDiscount =
    defaults?.discount && defaults.discount > 0
      ? defaults.discount
      : AI_SETTING_DEFAULTS.recoveryDiscountPercent;
  const defaultBundle =
    defaults?.bundle && defaults.bundle > 0
      ? defaults.bundle
      : AI_SETTING_DEFAULTS.recoveryBundleDiscountPercent;

  const lastOffer = newestRecoveryOfferMessage(assistants);
  if (!lastOffer) return null;

  if (isBundleOfferMessage(lastOffer)) {
    return {
      type: "bundle",
      percent: percentFromOfferMessage(lastOffer, defaultBundle),
      defaultQty: 2,
    };
  }

  if (isDiscountOfferMessage(lastOffer)) {
    return {
      type: "discount",
      percent: percentFromOfferMessage(lastOffer, defaultDiscount),
      defaultQty: 1,
    };
  }

  return null;
}

/** Fixed-format quantity extraction ("qty 2", "x3", "2 pieces") — used by
 * the manual-order inbox UI. */
export function parseOrderQuantity(text: string, defaultQty = 1): number {
  const m =
    text.match(/(?:qty|quantity|pcs|pieces|units|items)\s*[:=]?\s*(\d{1,2})\b/i) ||
    text.match(/\bx\s*(\d{1,2})\b/i) ||
    text.match(/\b(\d{1,2})\s*(?:pcs|pieces|units|items|x)\b/i) ||
    text.match(/\b(?:want|need|order|buy)\s+(\d{1,2})\b/i);
  const n = m ? Number(m[1]) : defaultQty;
  if (!Number.isFinite(n)) return defaultQty;
  return Math.min(50, Math.max(1, Math.round(n)));
}

/** Passive signal for the customer profile store (not reply-routing) — used
 * by agent-memory-context.ts to tag an "objection" note, and by
 * model-routing.ts to route to a more careful model on price pushback. */
export function looksLikeOrderDecline(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  // Asking for other products is browse — not a price decline
  if (
    /\b(different|other|more)\s+products?\b/i.test(t) ||
    /\bshare\s+(?:me\s+)?(?:some\s+)?(?:other|different|more)\b/i.test(t)
  ) {
    return false;
  }
  if (parseCheckoutDetails(t)) return false;
  if (HARD_STOP_PATTERN.test(t)) return true;
  if (/^(no|nope|nah|not now|maybe later|no thanks|don't want)\.?$/i.test(t)) {
    return true;
  }
  return DECLINE_PATTERN.test(t);
}
