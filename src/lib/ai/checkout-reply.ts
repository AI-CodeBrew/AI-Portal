import { extractSkuFromText } from "@/lib/products/products-service";
import { normalizePhone } from "@/lib/whatsapp";
import { executeSalesTool, type AgentContext } from "./sales-tools";

const CHECKOUT_INTENT =
  /\b(place\s+(an\s+)?order|want\s+to\s+(order|buy)|order\s+(this|it|now)|buy\s+(this|it|now)|checkout|confirm\s+(my\s+)?order|i('m| am)?\s+(ready|ordering))\b/i;

const HAS_CONTACT_HINT =
  /\b(name|naam|phone|ph|mobile|whatsapp|address|addr|city|deliver)\b/i;

export function looksLikeCheckoutMessage(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  const digits = t.replace(/\D/g, "");
  const hasPhone = digits.length >= 10;
  if (CHECKOUT_INTENT.test(t) && (hasPhone || HAS_CONTACT_HINT.test(t))) {
    return true;
  }
  // Name + phone + address style without explicit "order"
  if (hasPhone && HAS_CONTACT_HINT.test(t) && t.length >= 25) {
    return true;
  }
  return false;
}

export function parseCheckoutDetails(text: string): {
  customer_name: string;
  phone: string;
  address1: string;
  city: string;
  address2?: string;
} | null {
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
  if (!customer_name) {
    // First non-empty line that isn't phone/address labeled
    const firstLine = t
      .split("\n")
      .map((l) => l.trim())
      .find(
        (l) =>
          l &&
          !/^(phone|ph|address|city|sku|order)/i.test(l) &&
          !/\d{8,}/.test(l)
      );
    if (firstLine && firstLine.length <= 60) {
      customer_name = firstLine.replace(/^(i am|i'm|my name is)\s+/i, "").trim();
    }
  }
  if (!customer_name || customer_name.length < 2) return null;

  const addressMatch = t.match(
    /(?:address|addr|delivery(?:\s+address)?|shipping)[:\s\-]*([^\n]+)/i
  );
  let address1 = addressMatch?.[1]?.trim() ?? "";
  if (!address1) {
    const lines = t
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter(
        (l) =>
          !normalizePhone(l).includes(phone) &&
          !new RegExp(customer_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(
            l
          ) &&
          !/^(name|phone|ph|sku|order|city)\b/i.test(l)
      );
    address1 = lines.sort((a, b) => b.length - a.length)[0] ?? "";
  }
  if (!address1 || address1.length < 5) return null;

  const cityMatch = t.match(/(?:city|district)[:\s\-]*([A-Za-z][A-Za-z\s-]{1,40})/i);
  let city = cityMatch?.[1]?.trim() ?? "";
  if (!city) {
    // Heuristic: last comma segment of address
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

function findProductRefFromHistory(
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

/**
 * When the customer shares name/phone/address to place an order, create + confirm
 * without depending on the LLM calling tools.
 */
export async function tryDirectCheckoutReply(
  ctx: AgentContext,
  latestUserMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string | null> {
  if (!looksLikeCheckoutMessage(latestUserMessage)) return null;

  const details = parseCheckoutDetails(latestUserMessage);
  if (!details) {
    return "I can place that order — please share your full name, phone number, and complete delivery address (with city).";
  }

  const productRef =
    findProductRefFromHistory([
      ...history,
      { role: "user", content: latestUserMessage },
    ]) || findProductRefFromHistory(history);

  if (!productRef) {
    return "I have your details. Which product should I order? Please send the product name or SKU again.";
  }

  const { result } = await executeSalesTool(
    "create_draft_order",
    {
      line_items: [
        {
          quantity: 1,
          ...(productRef.sku ? { sku: productRef.sku, source: "portal" } : {}),
          ...(productRef.variant_id
            ? { variant_id: productRef.variant_id, source: productRef.source }
            : {}),
          ...(productRef.product_id
            ? { product_id: productRef.product_id, source: "portal" }
            : {}),
        },
      ],
      customer_name: details.customer_name,
      phone: details.phone,
      address1: details.address1,
      city: details.city,
    },
    ctx
  );

  if (
    result &&
    typeof result === "object" &&
    "success" in result &&
    (result as { success?: boolean }).success
  ) {
    const r = result as {
      order_number?: string;
      total_formatted?: string;
      whatsapp_sent?: boolean;
      message?: string;
    };
    return [
      `✅ Order *${r.order_number}* confirmed!`,
      r.total_formatted ? `Total: ${r.total_formatted}` : null,
      `We'll prepare it for dispatch.`,
      r.whatsapp_sent
        ? `A confirmation was also sent to ${details.phone}.`
        : `Confirmation will be sent to ${details.phone} shortly.`,
      `Thank you, ${details.customer_name}!`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const err =
    result && typeof result === "object" && "error" in result
      ? String((result as { error: unknown }).error)
      : "Could not create the order";

  console.error("[tryDirectCheckoutReply]", err);
  return `I couldn't complete the order yet (${err}). Please confirm the product SKU/name and your address, or wait for a team member.`;
}
