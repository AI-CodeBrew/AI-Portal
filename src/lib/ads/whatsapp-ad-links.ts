const AD_REF_PATTERN = /\(?ref:\s*([a-z0-9][a-z0-9_-]{1,47})\)?/i;

export function parseAdRefFromMessage(text: string): string | null {
  const match = text.match(AD_REF_PATTERN);
  return match?.[1]?.toLowerCase() ?? null;
}

export function buildAdPrefillMessage(productTitle: string, slug: string): string {
  return `Hi! I saw your ad for "${productTitle}". (ref: ${slug})`;
}

export function buildWhatsAppAdUrl(
  displayPhone: string,
  prefillMessage: string
): string {
  const phone = displayPhone.replace(/\D/g, "");
  const text = encodeURIComponent(prefillMessage);
  return `https://wa.me/${phone}?text=${text}`;
}

export function generateAdSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let slug = "";
  for (let i = 0; i < 8; i++) {
    slug += chars[Math.floor(Math.random() * chars.length)];
  }
  return slug;
}

export function adLinkToProductContext(
  link: {
    slug: string;
    product_title: string;
    product_description: string | null;
    variant_title: string | null;
    price: string | null;
    currency: string | null;
    product_sku?: string | null;
    image_url?: string | null;
    shopify_product_id: string | null;
    shopify_variant_id: string | null;
    portal_product_id?: string | null;
    portal_variant_id?: string | null;
  }
) {
  const isPortal = Boolean(link.portal_product_id);
  return {
    slug: link.slug,
    productTitle: link.product_title,
    productDescription: link.product_description,
    variantTitle: link.variant_title,
    price: link.price,
    currency: link.currency,
    sku: link.product_sku ?? (isPortal ? link.slug : null),
    imageUrl: link.image_url ?? null,
    shopifyProductId: link.shopify_product_id,
    shopifyVariantId: link.shopify_variant_id,
    portalProductId: link.portal_product_id ?? null,
    portalVariantId: link.portal_variant_id ?? null,
    source: isPortal ? ("portal" as const) : ("shopify" as const),
  };
}

export function formatAdContextForPrompt(
  ctx: import("./types").AdProductContext
): string {
  const lines = [
    "The customer arrived from a Meta/WhatsApp ad for a specific product.",
    `Product: ${ctx.productTitle}`,
  ];
  if (ctx.sku) {
    lines.push(`SKU / ref: ${ctx.sku}`);
  }
  if (ctx.variantTitle && ctx.variantTitle !== "Default Title") {
    lines.push(`Variant: ${ctx.variantTitle}`);
  }
  if (ctx.price) {
    lines.push(
      `Listed price: ${ctx.price}${ctx.currency ? ` ${ctx.currency}` : ""}`
    );
  }
  if (ctx.productDescription) {
    lines.push(`Description: ${ctx.productDescription.slice(0, 400)}`);
  }
  if (ctx.source === "portal") {
    lines.push("Source: reseller portal catalog (not Shopify).");
    if (ctx.portalProductId) {
      lines.push(`Portal product ID: ${ctx.portalProductId}`);
    }
    lines.push(
      "They are already interested in THIS product. Answer about it directly using the details above. If they want to buy, collect name, phone, and address, then create an order / escalate as needed."
    );
  } else {
    if (ctx.shopifyProductId) {
      lines.push(`Shopify product ID: ${ctx.shopifyProductId}`);
    }
    if (ctx.shopifyVariantId) {
      lines.push(`Shopify variant ID: ${ctx.shopifyVariantId}`);
    }
    lines.push(
      "They are already interested in THIS product. Answer about it directly — use check_stock with the variant ID when needed, and guide them to purchase with create_draft_order."
    );
  }
  return lines.join("\n");
}
