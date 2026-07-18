import { normalizePhone, validateOrderPhone } from "@/lib/phone";
import {
  extractSkuFromText,
  looksLikeObjectionPhrase,
} from "@/lib/products/products-service";
import { looksLikeVariantSelection } from "./variant-selection";
import { looksLikeExactNamedProductQuery } from "./exact-routes";

const CHECKOUT_INTENT =
  /\b(place\s+(an\s+)?order|want\s+to\s+(order|buy)|order\s+(this|it|now)|buy\s+(this|it|now)|checkout|confirm\s+(my\s+)?order|i('m| am)?\s+(ready|ordering)|yes|yeah|yep|ok|okay|sure|deal)\b/i;

const HAS_CONTACT_HINT =
  /\b(name|naam|phone|ph|mobile|whatsapp|address|addr|city|deliver)\b/i;

const ASKED_FOR_DETAILS =
  /\b(full name|share your|delivery address|reply like this|phone \(for confirmation\)|please share|i'll place the order|i'll confirm your order|discounted price|want to order|phone.*required|delivery address.*required|almost there)\b/i;

/** Product/catalog question — not checkout contact details. Exact patterns only. */
export function looksLikeProductQuestion(
  text: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): boolean {
  const t = text.trim();
  if (t.length < 3) return false;
  if (looksLikeObjectionPhrase(t)) return false;
  if (looksLikeVariantSelection(t, history)) return false;
  if (extractSkuFromText(t)) return true;
  return looksLikeExactNamedProductQuery(t);
}

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

export function assistantAskedForCheckoutDetails(
  history: Array<{ role: "user" | "assistant"; content: string }>
): boolean {
  const recent = history
    .filter((m) => m.role === "assistant")
    .slice(-6)
    .map((m) => m.content)
    .join("\n");
  return ASKED_FOR_DETAILS.test(recent);
}

export function looksLikeCheckoutMessage(
  text: string,
  history?: Array<{ role: "user" | "assistant"; content: string }>
): boolean {
  const t = text.trim();
  if (t.length < 8) return false;

  // New product question — never treat as checkout, even mid order flow
  if (looksLikeProductQuestion(t, history ?? [])) return false;

  const digits = t.replace(/\D/g, "");
  const hasPhone = digits.length >= 8;

  if (HAS_CONTACT_HINT.test(t) && t.length >= 12) {
    return true;
  }

  if (CHECKOUT_INTENT.test(t) && (HAS_CONTACT_HINT.test(t) || t.length >= 20)) {
    return true;
  }

  if (
    history &&
    assistantAskedForCheckoutDetails(history) &&
    t.length >= 10
  ) {
    // Only continue checkout if they're sending contact details or accepting
    if (HAS_CONTACT_HINT.test(t) || digits.length >= 10) return true;
    if (CHECKOUT_INTENT.test(t) && !looksLikeProductQuestion(t, history ?? [])) return true;
    return false;
  }

  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && hasPhone && t.length >= 15) {
    return true;
  }

  if (
    CHECKOUT_INTENT.test(t) &&
    t.length >= 10 &&
    !looksLikeProductQuestion(t, history ?? [])
  ) {
    return true;
  }

  return false;
}

function extractPhoneRaw(text: string): string {
  const t = text.replace(/\r/g, "\n").trim();
  const phoneMatch =
    t.match(
      /(?:phone|ph|mobile|whatsapp|number|cell)[:\s\-]*([+\d][\d\s\-()]{6,}\d)/i
    ) || t.match(/([+]?\d[\d\s\-()]{8,}\d)/);
  if (phoneMatch?.[1]?.trim()) return phoneMatch[1].trim();
  const digitsAll = t.replace(/\D/g, "");
  if (digitsAll.length >= 8) return digitsAll;
  return "";
}

function extractAddress(text: string, phone: string, customerName: string): string {
  const t = text.replace(/\r/g, "\n").trim();
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
 * Prefer the assistant product card that has both SKU and Ref so Shopify-registry
 * products (SKU mapped, numeric variant Ref) can still be ordered.
 */
export function findProductRefFromHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): { sku?: string; variant_id?: string; product_id?: string; source?: string } | null {
  const combined = [...history].reverse();

  for (const msg of combined) {
    if (msg.role !== "assistant") continue;
    const sku = extractSkuFromText(msg.content);
    const ref = extractRefFromContent(msg.content);
    if (!sku && !ref) continue;

    const isShopifyRef = Boolean(ref && /^\d{5,}$/.test(ref));
    const isPortalRef = Boolean(
      ref &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          ref
        )
    );

    return {
      ...(sku ? { sku } : {}),
      ...(ref ? { variant_id: ref } : {}),
      source: isShopifyRef ? "shopify" : isPortalRef || sku ? "portal" : "shopify",
    };
  }

  for (const msg of combined) {
    const sku = extractSkuFromText(msg.content);
    if (sku) {
      return { sku, source: "portal" };
    }
  }

  return null;
}
