const GREETING_ONLY =
  /^(hi+|hey+|heya+|hello+|hola+|yo+|sup+|assalam+|salam+|assalamu+|good morning|good evening|good afternoon|good night)([\s,!.?-]*(again|back|there|bro|sis|friend))?[\s!.?,]*$/i;

/** Whole-message greeting only — exact match, not "hey there whats the price".
 * Used to decide whether to send the store's static opening/welcome message
 * on a brand-new conversation (not for AI reply routing — the LLM handles
 * greeting conversation itself once the agent runs). */
export function looksLikeExactGreetingOnly(text: string): boolean {
  return GREETING_ONLY.test(text.trim());
}
