import { normalizePhone, validateOrderPhone } from "@/lib/phone";
import {
  extractSkuFromText,
  CATALOG_BROWSE_INTRO,
  CATALOG_BROWSE_MORE_INTRO,
} from "@/lib/products/products-service";

export type CheckoutDetails = {
  customer_name: string;
  phone: string;
  address1: string;
  city: string;
  address2?: string;
};

export type CheckoutValidationIssue =
  | "missing_phone"
  | "incomplete_phone"
  | "invalid_phone"
  | "missing_address";

export type CheckoutValidation =
  | { ok: true; details: CheckoutDetails }
  | { ok: false; issues: CheckoutValidationIssue[] };

function extractPhoneRaw(text: string): string {
  const t = text.replace(/\r/g, "\n").trim();
  const labeledParen = t.match(
    /\b(?:phone|ph|mobile|whatsapp|number|cell)\s*[:(]\s*([^)\n]+)\)?/i
  );
  if (labeledParen?.[1]?.trim()) {
    const inner = labeledParen[1].replace(/\D/g, "");
    if (inner.length >= 8) return inner;
  }
  const phoneMatch =
    t.match(
      /(?:phone|ph|mobile|whatsapp|number|cell)[:\s\-]*([+\d][\d\s\-()]{6,}\d)/i
    ) || t.match(/([+]?\d[\d\s\-()]{8,}\d)/);
  if (phoneMatch?.[1]?.trim()) {
    return phoneMatch[1].replace(/\D/g, "");
  }
  const digitsAll = t.replace(/\D/g, "");
  if (digitsAll.length >= 8) return digitsAll;
  return "";
}

function stripLeadingPhoneFromText(text: string, phoneRaw: string): string {
  const rest = text.trim();
  if (!phoneRaw) return rest;

  const escaped = phoneRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^\\s*${escaped}`, "i").test(rest)) {
    return rest
      .replace(new RegExp(`^\\s*${escaped}\\s*`, "i"), "")
      .replace(/^[,.\s-]+/, "")
      .trim();
  }

  const digits = normalizePhone(phoneRaw);
  if (digits.length >= 8) {
    const flex = digits.split("").join("\\D*");
    const match = rest.match(new RegExp(`^\\s*${flex}\\s*`, "i"));
    if (match) {
      return rest
        .slice(match[0].length)
        .replace(/^[,.\s-]+/, "")
        .trim();
    }
  }

  return rest;
}

function extractAddress(text: string, phone: string, customerName: string): string {
  const t = text.replace(/\r/g, "\n").trim();
  const labeledParen = t.match(/\b(?:address|addr|delivery)\s*[:(]\s*([^)\n]+)\)?/i);
  if (labeledParen?.[1]?.trim()) {
    return labeledParen[1].trim();
  }

  const phoneRaw = phone || extractPhoneRaw(t);
  const afterPhone = stripLeadingPhoneFromText(t.replace(/\n/g, ", "), phoneRaw);
  if (afterPhone.length >= 4 && afterPhone !== t.replace(/\n/g, ", ")) {
    return afterPhone;
  }

  const lines = t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) =>
      l
        .replace(/^(yes|yeah|yep|ok|okay|sure|deal)[!.\s,]*/i, "")
        .trim()
    )
    .filter(Boolean);

  const addressMatch = t.match(
    /(?:address|addr|delivery(?:\s+address)?|shipping)[:\s\-]*([^\n]+)/i
  );
  let address1 = addressMatch?.[1]?.trim() ?? "";

  if (!address1) {
    const nameRe = customerName
      ? new RegExp(
          customerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        )
      : null;
    const candidates = lines.filter(
      (l) =>
        !normalizePhone(l).includes(phone.slice(-10)) &&
        normalizePhone(l).length < 10 &&
        !(nameRe?.test(l)) &&
        !/^(name|phone|ph|sku|order|city|qty|quantity|yes)\b/i.test(l)
    );
    address1 =
      candidates.sort((a, b) => b.length - a.length)[0] ??
      candidates[0] ??
      "";
  }

  if (!address1 || address1.length < 4) {
    const nameRe = customerName
      ? new RegExp(
          customerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        )
      : null;
    address1 = lines
      .filter(
        (l) =>
          !(nameRe?.test(l)) &&
          normalizePhone(l).length < 10 &&
          !/^(yes|ok|okay|name|phone|ph)\b/i.test(l)
      )
      .join(", ");
  }

  return address1.trim();
}

function extractCustomerName(text: string): string {
  const t = text.replace(/\r/g, "\n").trim();
  const labeledParen = t.match(/\b(?:name|naam|customer)\s*[:(]\s*([^)\n]+)\)?/i);
  if (labeledParen?.[1]?.trim()) {
    return labeledParen[1].trim();
  }

  const nameMatch = t.match(
    /(?:name|naam|customer)[:\s\-]*([A-Za-z][A-Za-z\s.'-]{1,60})/i
  );
  let customer_name = nameMatch?.[1]?.trim() ?? "";

  const lines = t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (!customer_name) {
    const firstLine = lines.find(
      (l) =>
        !/^(phone|ph|address|city|sku|order|qty|quantity)\b/i.test(l) &&
        !/\d{8,}/.test(l) &&
        /[A-Za-z]{2,}/.test(l) &&
        l.length <= 60
    );
    if (firstLine) {
      customer_name = firstLine
        .replace(/^(i am|i'm|my name is)\s+/i, "")
        .replace(/^(name|naam)\s*[:=]\s*/i, "")
        .trim();
    }
  }

  return customer_name.trim();
}

function extractCity(text: string, address1: string): { city: string; address1: string } {
  const cityMatch = text.match(
    /(?:city|district)[:\s\-]*([A-Za-z][A-Za-z\s-]{1,40})/i
  );
  let city = cityMatch?.[1]?.trim() ?? "";
  let addr = address1;

  if (!city) {
    const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      city = parts[parts.length - 1];
      addr = parts.slice(0, -1).join(", ");
    } else {
      city = "N/A";
    }
  }

  return { city, address1: addr };
}

/**
 * Free-text checkout parsing — kept for the manual-order inbox UI and passive
 * profile enrichment, which both hand this a raw pasted message with no LLM
 * in the loop. The AI sales agent does NOT use this — it has the LLM read
 * the customer's message and fill create_draft_order's structured fields
 * itself; only the phone format is validated (validateOrderPhone), not
 * detected/guessed.
 */
export function validateCheckoutMessage(
  text: string,
  hintPhone?: string | null
): CheckoutValidation {
  const issues: CheckoutValidationIssue[] = [];
  const phoneRaw = extractPhoneRaw(text);

  let validatedPhone: string | null = null;
  if (!phoneRaw) {
    issues.push("missing_phone");
  } else {
    const phoneCheck = validateOrderPhone(phoneRaw, hintPhone);
    if (!phoneCheck.ok) {
      if (phoneCheck.issue === "incomplete") issues.push("incomplete_phone");
      else issues.push("invalid_phone");
    } else {
      validatedPhone = phoneCheck.phone;
    }
  }

  const customer_name = extractCustomerName(text) || "Customer";
  const address1 = extractAddress(
    text,
    validatedPhone ?? normalizePhone(phoneRaw).slice(-12),
    customer_name
  );

  if (!address1 || address1.length < 4) {
    issues.push("missing_address");
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  if (!validatedPhone) {
    return { ok: false, issues: ["invalid_phone"] };
  }

  const { city, address1: addr1 } = extractCity(text, address1);

  return {
    ok: true,
    details: {
      customer_name,
      phone: validatedPhone,
      address1: addr1,
      city,
    },
  };
}

export function parseCheckoutDetails(
  text: string,
  hintPhone?: string | null
): CheckoutDetails | null {
  const result = validateCheckoutMessage(text, hintPhone);
  return result.ok ? result.details : null;
}

function extractRefFromContent(content: string): string | null {
  return (
    content.match(/\[Ref:\s*([0-9a-f-]{36}|\d{5,})\]/i)?.[1] ||
    content.match(/\bRef:\s*([0-9a-f-]{36}|\d{5,})\b/i)?.[1] ||
    content.match(
      /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i
    )?.[1] ||
    content.match(/\bvariant[_ ]?id[:\s]*([0-9a-f-]{36}|\d{5,})\b/i)?.[1] ||
    null
  );
}

/**
 * Prefer the product the customer is actually ordering — not an older browse list item.
 * Used as a pre-flight backstop in create_draft_order when the LLM's line
 * items omit a sku/variant_id.
 */
export function findProductRefFromHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): { sku?: string; variant_id?: string; product_id?: string; source?: string } | null {
  type Candidate = {
    score: number;
    sku?: string;
    variant_id?: string;
    source?: string;
  };

  const candidates: Candidate[] = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== "assistant") continue;

    const content = msg.content;
    if (/Almost there — to confirm/i.test(content)) continue;
    if (/Send like this:/i.test(content) && /Phone:\s*\(required\)/i.test(content)) {
      continue;
    }

    const ref = extractRefFromContent(content);
    const sku = extractSkuFromText(content);
    if (!ref && !sku) continue;

    let score = history.length - i;
    if (/Perfect — share your \*phone\*/i.test(content)) score += 100;
    if (/\*[^*]+\* — \*[^*]+\*/.test(content)) score += 80;
    if (/Want it\?\s*Share your phone/i.test(content)) score += 60;
    if (/(?:—|-)\s*(?:Rs\.?|PKR|AED|\$|€)/i.test(content)) score += 20;
    if (
      CATALOG_BROWSE_INTRO.test(content) ||
      CATALOG_BROWSE_MORE_INTRO.test(content)
    ) {
      score -= 50;
    }
    if (/Which one interests you\?/i.test(content)) score -= 40;

    const isShopifyRef = Boolean(ref && /^\d{5,}$/.test(ref));
    const isPortalRef = Boolean(
      ref &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          ref
        )
    );

    candidates.push({
      score,
      ...(sku ? { sku } : {}),
      ...(ref ? { variant_id: ref } : {}),
      source: isShopifyRef
        ? "shopify"
        : isPortalRef || sku
          ? "portal"
          : "shopify",
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return null;

  return {
    ...(best.sku ? { sku: best.sku } : {}),
    ...(best.variant_id ? { variant_id: best.variant_id } : {}),
    source: best.source,
  };
}
