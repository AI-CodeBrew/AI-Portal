import type { SearchProduct } from "./product-reply";
import { extractSkuFromText, extractProductSearchQuery } from "@/lib/products/products-service";
import { isProductOutOfStock } from "./product-stock";

export function looksLikeProductComparison(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;

  if (
    /\b(vs\.?|versus|compare|comparison|difference between|differences between|which is better|which one|better between|between .+ and)\b/i.test(
      t
    )
  ) {
    return true;
  }

  const skus = [...t.matchAll(/\b(AA-[A-Z0-9]{6,})\b/gi)];
  if (skus.length >= 2) return true;

  if (/\bor\b/i.test(t) && extractComparisonTargets(t).length >= 2) {
    return true;
  }

  return false;
}

/** Pull 2–3 product names/SKUs from a comparison message. */
export function extractComparisonTargets(text: string): string[] {
  const t = text.trim();
  const found: string[] = [];

  const skus = [...t.matchAll(/\b(AA-[A-Z0-9]{6,})\b/gi)].map((m) => m[1]!);
  if (skus.length >= 2) {
    return Array.from(new Set(skus.map((s) => s.toUpperCase()))).slice(0, 3);
  }

  const compareAnd = t.match(
    /\bcompare\s+(.+?)\s+(?:and|&|with|vs\.?|versus)\s+(.+?)(?:\?|$)/i
  );
  if (compareAnd) {
    for (const part of [compareAnd[1], compareAnd[2]]) {
      const q =
        extractSkuFromText(part) ||
        extractProductSearchQuery(part) ||
        part.trim();
      if (q.length >= 2) found.push(q);
    }
    if (found.length >= 2) return found.slice(0, 3);
  }

  const diffBetween = t.match(
    /\bdifference[s]? between\s+(.+?)\s+and\s+(.+?)(?:\?|$)/i
  );
  if (diffBetween) {
    for (const part of [diffBetween[1], diffBetween[2]]) {
      const q =
        extractSkuFromText(part) ||
        extractProductSearchQuery(part) ||
        part.trim();
      if (q.length >= 2) found.push(q);
    }
    if (found.length >= 2) return found.slice(0, 3);
  }

  const vsParts = t.split(/\s+vs\.?\s+|\s+versus\s+/i);
  if (vsParts.length >= 2) {
    for (const part of vsParts) {
      const cleaned = part
        .replace(/\b(which|what|is|better|compare|tell me about)\b/gi, " ")
        .trim();
      const q =
        extractSkuFromText(cleaned) ||
        extractProductSearchQuery(cleaned) ||
        cleaned;
      if (q.length >= 2) found.push(q);
    }
    if (found.length >= 2) return found.slice(0, 3);
  }

  const orParts = t.split(/\s+or\s+/i);
  if (orParts.length >= 2 && /\b(which|better|compare|vs)\b/i.test(t)) {
    for (const part of orParts) {
      const q =
        extractSkuFromText(part) ||
        extractProductSearchQuery(part) ||
        part.replace(/\?.*$/, "").trim();
      if (q.length >= 2) found.push(q);
    }
    if (found.length >= 2) return found.slice(0, 3);
  }

  return found.slice(0, 3);
}

const USE_CASE_PATTERN =
  /\b(gift|budget|cheap|afford|durabl|quality|best|loud|bass|portable|travel|gym|home|office|daily|work|professional|beginner|premium|under|max|need it for|for my|for a|priority|important|mainly|mostly|sasta|mehnga|quality|awaz|sound)\b/i;

export function hasComparisonUseCase(
  text: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): boolean {
  const recent = history
    .filter((m) => m.role === "user")
    .slice(-4)
    .map((m) => m.content)
    .concat(text)
    .join(" ");
  return USE_CASE_PATTERN.test(recent);
}

function primaryPrice(p: SearchProduct): string | null {
  const variants = p.variants ?? [];
  const v = variants.find((x) => x.price_formatted) ?? variants[0];
  const raw = v?.price_formatted;
  if (!raw || /see store for price/i.test(raw) || raw === "0") return null;
  return raw;
}

function stockLabel(p: SearchProduct): string {
  if (isProductOutOfStock(p)) return "out of stock";
  const variants = p.variants ?? [];
  const unavailable = variants.filter((v) => v.in_stock === false).length;
  if (unavailable > 0 && unavailable < variants.length) {
    return "some variants out of stock";
  }
  return "in stock";
}

function pickRecommendation(
  products: SearchProduct[],
  context: string
): SearchProduct | null {
  if (products.length < 2) return products[0] ?? null;

  const inStock = products.filter((p) => !isProductOutOfStock(p));
  if (inStock.length === 1) return inStock[0]!;

  const budget = /\b(budget|cheap|afford|sasta|under|lowest price|kam price)\b/i.test(
    context
  );
  const quality = /\b(quality|premium|best|durable|durabl|awaz|sound|loud)\b/i.test(
    context
  );

  const priced = products
    .map((p) => ({
      p,
      price: primaryPrice(p),
      num: parseFloat(
        (primaryPrice(p) ?? "").replace(/[^\d.]/g, "") || "NaN"
      ),
    }))
    .filter((x) => Number.isFinite(x.num));

  if (budget && priced.length >= 2) {
    return priced.sort((a, b) => a.num - b.num)[0]!.p;
  }

  if (quality && priced.length >= 2) {
    return priced.sort((a, b) => b.num - a.num)[0]!.p;
  }

  if (inStock.length >= 1) return inStock[0]!;

  return products[0] ?? null;
}

export function formatProductComparisonReply(
  products: SearchProduct[],
  lang: "en" | "ar" | "roman",
  opts: { hasUseCase: boolean; userText: string }
): string {
  const lines: string[] = [];

  for (const p of products.slice(0, 3)) {
    const price = primaryPrice(p);
    const stock = stockLabel(p);
    lines.push(
      `*${p.title || "Product"}*${p.sku ? ` (${p.sku})` : ""} — ${price ?? "price on request"} · ${stock}`
    );
  }

  const priceA = primaryPrice(products[0]!);
  const priceB = primaryPrice(products[1]!);
  const numA = parseFloat((priceA ?? "").replace(/[^\d.]/g, "") || "NaN");
  const numB = parseFloat((priceB ?? "").replace(/[^\d.]/g, "") || "NaN");

  const diffLines: string[] = [];
  if (products.length >= 2 && Number.isFinite(numA) && Number.isFinite(numB)) {
    const diff = Math.abs(numA - numB);
    if (diff > 0) {
      const cheaper =
        numA < numB ? products[0]!.title : products[1]!.title;
      diffLines.push(
        lang === "ar"
          ? `الفرق في السعر: ${cheaper} أرخص.`
          : lang === "roman"
            ? `Price farq: *${cheaper}* sasta hai.`
            : `Price: *${cheaper}* is the cheaper option.`
      );
    }
  }

  const stockA = stockLabel(products[0]!);
  const stockB = products[1] ? stockLabel(products[1]) : null;
  if (
    stockB &&
    stockA !== stockB &&
    (stockA === "out of stock" || stockB === "out of stock")
  ) {
    diffLines.push(
      lang === "ar"
        ? `المخزون: ${stockA === "out of stock" ? products[0]!.title : products[1]!.title} غير متوفر حالياً.`
        : lang === "roman"
          ? `Stock: ${stockA === "out of stock" ? products[0]!.title : products[1]!.title} abhi out of stock hai.`
          : `Stock: ${stockA === "out of stock" ? products[0]!.title : products[1]!.title} is out of stock right now.`
    );
  }

  if (!opts.hasUseCase) {
    const ask =
      lang === "ar"
        ? "ما الأهم لك — السعر أم الجودة/الاستخدام؟ (سؤال واحد فقط)"
        : lang === "roman"
          ? "Aap ke liye kya zyada important hai — price ya quality/use? (ek short jawab)"
          : "What's more important for you — price or quality/use? (one quick answer helps me recommend)";
    return `${lines.join("\n")}\n\n${ask}`;
  }

  const pick = pickRecommendation(products, opts.userText);
  const rec =
    pick &&
    (lang === "ar"
      ? `توصيتي: *${pick.title}* — يناسب ما ذكرت.`
      : lang === "roman"
        ? `Meri recommendation: *${pick.title}* — aap ki need ke hisaab se.`
        : `I'd go with *${pick.title}* based on what you said.`);

  const parts = [lines.join("\n")];
  if (diffLines.length) parts.push(diffLines.join("\n"));
  if (rec) parts.push(rec);
  parts.push(
    lang === "ar"
      ? "أي واحد تريد أن أطلبه لك؟"
      : lang === "roman"
        ? "Kaunsa order karun?"
        : "Want to order one of these?"
  );

  return parts.join("\n\n");
}

/** Hint for LLM when customer is comparing products. */
export function productComparisonHint(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  latestUserMessage: string
): string | null {
  if (!looksLikeProductComparison(latestUserMessage)) return null;
  const targets = extractComparisonTargets(latestUserMessage);
  const targetNote =
    targets.length >= 2
      ? ` Items to look up separately: ${targets.map((t) => `"${t}"`).join(", ")}.`
      : "";
  return `\n\nThe customer is COMPARING products.${targetNote} Call get_product_details (or search_products) once per item — never compare from memory. Highlight 1-2 differences that matter (price, stock, size). If their priority is unclear, ask ONE short clarifying question before recommending. If you have enough context, give a clear recommendation — keep it short for WhatsApp, no spec dumps. Mention stock only as useful info.`;
}
