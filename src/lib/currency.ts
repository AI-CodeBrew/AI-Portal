const CURRENCY_LOCALES: Record<string, string> = {
  PKR: "en-PK",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
  AED: "en-AE",
  SAR: "ar-SA",
  INR: "en-IN",
};

/** Currency codes selectable as the store-wide currency setting. */
export const SUPPORTED_STORE_CURRENCIES = Object.keys(
  CURRENCY_LOCALES
) as string[];

export const DEFAULT_STORE_CURRENCY = "PKR";

const effectiveCurrencyCache = new Map<
  string,
  { currency: string; expires: number }
>();
const EFFECTIVE_CURRENCY_TTL_MS = 5 * 60 * 1000;

/**
 * The single authoritative currency for a store — used for every product
 * quote, order total, and confirmation message, portal and Shopify alike.
 * Priority: reseller-configured `stores.currency` > synced Shopify shop
 * currency (`stores.shopify_currency`) > PKR.
 */
export function invalidateEffectiveStoreCurrency(storeId: string): void {
  effectiveCurrencyCache.delete(storeId);
}

export async function getEffectiveStoreCurrency(
  storeId: string
): Promise<string> {
  const cached = effectiveCurrencyCache.get(storeId);
  if (cached && cached.expires > Date.now()) {
    return cached.currency;
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("stores")
    .select("currency, shopify_currency")
    .eq("id", storeId)
    .maybeSingle();

  let currency = (data?.currency as string | null)?.trim().toUpperCase();
  if (!currency) {
    currency = (data?.shopify_currency as string | null)?.trim().toUpperCase();
  }

  currency = currency || DEFAULT_STORE_CURRENCY;
  effectiveCurrencyCache.set(storeId, {
    currency,
    expires: Date.now() + EFFECTIVE_CURRENCY_TTL_MS,
  });
  return currency;
}

export function formatMoney(
  amount: number | null | undefined,
  currency?: string | null,
  opts?: { whole?: boolean }
): string {
  const raw = Number(amount ?? 0);
  const value = opts?.whole ? Math.round(raw) : raw;
  const fractionDigits = opts?.whole ? 0 : 2;
  const code = currency?.trim().toUpperCase();

  if (!code) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }

  const locale = CURRENCY_LOCALES[code];

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return opts?.whole
      ? `${code} ${Math.round(value).toLocaleString()}`
      : `${code} ${value.toFixed(2)}`;
  }
}
