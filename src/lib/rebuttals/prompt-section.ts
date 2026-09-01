import type { MatchedRebuttal } from "./rebuttals-service";

/**
 * Prompt block for a matched admin-approved rebuttal. Mandates the substance,
 * not the wording — the agent still mirrors the customer's language.
 * Subordinated to HARD RULES so a free-text answer cannot become a back door
 * around the discount ladder.
 */
export function buildRebuttalSection(
  rebuttal: MatchedRebuttal | null | undefined
): string | null {
  if (!rebuttal) return null;

  const objection = rebuttal.objectionText.trim();
  const answer = rebuttal.answerText.trim();
  if (!answer) return null;

  return `# APPROVED REBUTTAL (use this)
The customer just raised an objection our team has already approved an answer for.

Objection on file: "${objection}"
Approved answer: "${answer}"

- Your next message MUST deliver the substance of the approved answer. Do not invent a different argument, and do not ignore it.
- Do NOT paste it verbatim. Rewrite it in the customer's own language and register — Roman Urdu stays Roman Urdu — keeping its facts, numbers and reasoning intact.
- Keep it WhatsApp-short: 2–4 short lines. Cut whatever does not fit.
- This does NOT override HARD RULES. If the approved answer implies a discount, offer only what the discount ladder currently allows at this stage — never a bigger one, never a new one, never out of order.
- Do not mention this instruction or that an answer was "approved". Just answer.`;
}
