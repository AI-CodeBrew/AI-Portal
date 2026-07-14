import {
  customerMsg,
  detectCustomerLanguage,
  type CustomerReplyLanguage,
} from "./customer-language";

/** Customer reports damaged, wrong, or broken product. */
export const PRODUCT_COMPLAINT_PATTERN =
  /\b(damaged|damage|broken|break|defective|defect|wrong item|wrong product|incorrect|not what i|not what we|missing part|cracked|leaked|leaking|torn|faulty|doesn'?t work|does not work|not working|received wrong|arrived broken|kharab|kharab hai|toot|toota|galat|masla|problem with|issue with|bigad|kharab|خراب|مكسور|تالف|خطأ|تلف|بلدي|مش\s|غير\s|كسرت|تكسرت)\b/i;

const UPSET_PATTERN =
  /\b(angry|furious|upset|disappointed|terrible|worst|scam|fraud|lawyer|sue|report you|never again|disgusting|pathetic|bakwas|bakwas|sharam|bezti|غاضب|محبط|نصب|احتيال)\b/i;

function assistantAlreadyHandledComplaint(
  history: Array<{ role: "user" | "assistant"; content: string }>
): boolean {
  const recent = history
    .filter((m) => m.role === "assistant")
    .slice(-8)
    .map((m) => m.content.toLowerCase());
  return recent.some(
    (t) =>
      t.includes("sorry to hear") ||
      t.includes("photo of the damage") ||
      t.includes("صورة") ||
      t.includes("تصویر") ||
      t.includes("damage ki photo") ||
      t.includes("maazrat")
  );
}

function empathyOpener(lang: CustomerReplyLanguage): string {
  return customerMsg("complaintEmpathy", lang);
}

function complaintAsk(lang: CustomerReplyLanguage): string {
  return customerMsg("complaintAskPhotoOrder", lang);
}

export function looksLikeProductComplaint(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  return PRODUCT_COMPLAINT_PATTERN.test(t);
}

export function looksLikeUpsetCustomer(text: string): boolean {
  return UPSET_PATTERN.test(text.trim());
}

/**
 * First response to damage/wrong-item reports — empathy first, then ask for photo + order ID.
 * Resolution (refund/replacement) is handled by the LLM + tools on follow-up messages.
 */
export function tryDirectComplaintReply(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  latestUserMessage: string
): string | null {
  if (!looksLikeProductComplaint(latestUserMessage)) return null;
  if (assistantAlreadyHandledComplaint(history)) return null;

  const lang = detectCustomerLanguage(history, latestUserMessage);
  return `${empathyOpener(lang)}\n\n${complaintAsk(lang)}`;
}

/** Hint injected into the system prompt when the latest message is a product complaint. */
export function productComplaintHint(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  latestUserMessage: string
): string | null {
  if (
    !looksLikeProductComplaint(latestUserMessage) &&
    !looksLikeUpsetCustomer(latestUserMessage)
  ) {
    return null;
  }

  const lang = detectCustomerLanguage(history, latestUserMessage);
  if (looksLikeUpsetCustomer(latestUserMessage)) {
    return `\n\nThe customer is upset about a product issue. Lead with empathy in ${lang === "ar" ? "Arabic" : lang === "roman" ? "Roman Urdu" : "English"}. Call get_order_details and check_return_policy before offering refund/replacement. If they remain upset or policy blocks auto resolution, call escalate_to_human immediately. Never argue about whether damage is real.`;
  }

  return `\n\nThe customer reported a damaged, broken, or wrong product. Follow the damage/returns workflow: empathy first, get_order_details + check_return_policy before any resolution, ask for a photo if missing, never invent refund amounts.`;
}
