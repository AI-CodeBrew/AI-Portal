/** Affirmations after "Did you mean *X*?" / "you want *X*?" clarify prompts. */
const PRODUCT_CONFIRM_AFFIRMATION =
  /^(yes|yeah|yep|yup|sure|ok|okay|correct|right|that(?:'s| is)?\s+(?:it|one|right)|this one|go ahead|continue|please)[\s!.?,]*$/i;

const DID_YOU_MEAN_RE = /Did you mean \*([^*]+)\*/i;
const CONFIRM_WANT_RE =
  /(?:you want|confirm)\s+\*([^*]+)\*(?:\s+in\s+\*([^*]+)\*)?/i;

export function extractPendingProductConfirm(
  history: Array<{ role: "user" | "assistant"; content: string }>
): { product: string; variant?: string } | null {
  const lastAssistant = [...history]
    .reverse()
    .find((m) => m.role === "assistant");
  if (!lastAssistant) return null;

  const content = lastAssistant.content;
  const want = content.match(CONFIRM_WANT_RE);
  if (want?.[1]?.trim()) {
    return {
      product: want[1].trim(),
      variant: want[2]?.trim() || undefined,
    };
  }

  const mean = content.match(DID_YOU_MEAN_RE);
  if (mean?.[1]?.trim()) {
    return { product: mean[1].trim() };
  }

  return null;
}

export function looksLikeProductConfirmAffirmation(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): boolean {
  if (!PRODUCT_CONFIRM_AFFIRMATION.test(message.trim())) return false;
  return Boolean(extractPendingProductConfirm(history));
}
