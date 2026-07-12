import { normalizePhone } from "@/lib/whatsapp";
import { extractSkuFromText } from "@/lib/products/products-service";

const CHECKOUT_INTENT =
  /\b(place\s+(an\s+)?order|want\s+to\s+(order|buy)|order\s+(this|it|now)|buy\s+(this|it|now)|checkout|confirm\s+(my\s+)?order|i('m| am)?\s+(ready|ordering)|yes|yeah|yep|ok|okay|sure|deal)\b/i;

const HAS_CONTACT_HINT =
  /\b(name|naam|phone|ph|mobile|whatsapp|address|addr|city|deliver)\b/i;

const ASKED_FOR_DETAILS =
  /\b(full name|share your|delivery address|phone \(for confirmation\)|please share|i'll place the order|i'll confirm your order|discounted price)\b/i;

export type CheckoutDetails = {
  customer_name: string;
  phone: string;
  address1: string;
  city: string;
  address2?: string;
};

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
  const digits = t.replace(/\D/g, "");
  const hasPhone = digits.length >= 10;

  if (!hasPhone) return false;

  if (CHECKOUT_INTENT.test(t) && (HAS_CONTACT_HINT.test(t) || t.length >= 20)) {
    return true;
  }

  if (HAS_CONTACT_HINT.test(t) && t.length >= 20) {
    return true;
  }

  // After we asked for name/phone/address, accept unlabeled contact blocks
  if (
    history &&
    assistantAskedForCheckoutDetails(history) &&
    t.length >= 15
  ) {
    return true;
  }

  // Multi-line contact dump: name + phone + address-ish
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && hasPhone && t.length >= 18) {
    return true;
  }

  return false;
}

export function parseCheckoutDetails(text: string): CheckoutDetails | null {
  const t = text.replace(/\r/g, "\n").trim();
  const digitsAll = t.replace(/\D/g, "");
  if (digitsAll.length < 10) return null;

  const phoneMatch =
    t.match(
      /(?:phone|ph|mobile|whatsapp|number|cell)[:\s\-]*([+\d][\d\s\-()]{8,}\d)/i
    ) || t.match(/([+]?\d[\d\s\-()]{8,}\d)/);

  const phoneRaw = phoneMatch?.[1]?.trim() ?? "";
  const phone = normalizePhone(phoneRaw || digitsAll.slice(-12));
  if (phone.length < 10) return null;

  const nameMatch = t.match(
    /(?:name|naam|customer)[:\s\-]*([A-Za-z][A-Za-z\s.'-]{1,60})/i
  );
  let customer_name = nameMatch?.[1]?.trim() ?? "";

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
  if (!customer_name || customer_name.length < 2) return null;

  const addressMatch = t.match(
    /(?:address|addr|delivery(?:\s+address)?|shipping)[:\s\-]*([^\n]+)/i
  );
  let address1 = addressMatch?.[1]?.trim() ?? "";
  if (!address1) {
    const nameRe = new RegExp(
      customer_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );
    const candidates = lines.filter(
      (l) =>
        !normalizePhone(l).includes(phone.slice(-10)) &&
        normalizePhone(l).length < 10 &&
        !nameRe.test(l) &&
        !/^(name|phone|ph|sku|order|city|qty|quantity|yes)\b/i.test(l)
    );
    address1 =
      candidates.sort((a, b) => b.length - a.length)[0] ??
      candidates[0] ??
      "";
  }
  if (!address1 || address1.length < 4) {
    // Last resort: everything except name/phone as address
    const nameRe = new RegExp(
      customer_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );
    address1 = lines
      .filter(
        (l) =>
          !nameRe.test(l) &&
          normalizePhone(l).length < 10 &&
          !/^(yes|ok|okay)\b/i.test(l)
      )
      .join(", ");
  }
  if (!address1 || address1.length < 4) return null;

  const cityMatch = t.match(
    /(?:city|district)[:\s\-]*([A-Za-z][A-Za-z\s-]{1,40})/i
  );
  let city = cityMatch?.[1]?.trim() ?? "";
  if (!city) {
    const parts = address1.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      city = parts[parts.length - 1];
      address1 = parts.slice(0, -1).join(", ");
    } else {
      city = "N/A";
    }
  }

  return { customer_name, phone, address1, city };
}

export function findProductRefFromHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): { sku?: string; variant_id?: string; product_id?: string; source?: string } | null {
  const combined = [...history].reverse();

  for (const msg of combined) {
    const sku = extractSkuFromText(msg.content);
    if (sku) {
      return { sku, source: "portal" };
    }
  }

  for (const msg of combined) {
    if (msg.role !== "assistant") continue;
    const ref =
      msg.content.match(/\bRef:\s*([0-9a-f-]{36}|\d{5,})\b/i)?.[1] ||
      msg.content.match(
        /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i
      )?.[1] ||
      msg.content.match(/\bvariant[_ ]?id[:\s]*([0-9a-f-]{36}|\d{5,})\b/i)?.[1];
    if (ref) {
      return {
        variant_id: ref,
        source: /^\d+$/.test(ref) ? "shopify" : "portal",
      };
    }
  }

  return null;
}
