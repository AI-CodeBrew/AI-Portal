import {
  customerMsg,
  type CustomerReplyLanguage,
} from "./customer-language";

/** Clear copy-paste template so customers send details the AI can parse. */
export function orderDetailsTemplate(opts?: {
  includeVariantHint?: boolean;
  defaultQty?: number;
  lang?: CustomerReplyLanguage;
}): string {
  const lang = opts?.lang ?? "en";
  const qty =
    opts?.defaultQty && opts.defaultQty > 1 ? String(opts.defaultQty) : "1";
  const variantLine = opts?.includeVariantHint
    ? `\n${customerMsg("orderVariant", lang)}`
    : "";

  return `${customerMsg("orderDetailsIntro", lang)}
${customerMsg("orderName", lang)}
${customerMsg("orderPhone", lang)}
${customerMsg("orderAddress", lang)}
${customerMsg("orderQty", lang)} ${qty}${variantLine}`;
}
