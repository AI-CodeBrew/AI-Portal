const CURRENCY_LOCALES: Record<string, string> = {
  PKR: "en-PK",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
  AED: "en-AE",
  SAR: "ar-SA",
  INR: "en-IN",
};

export function formatMoney(
  amount: number | null | undefined,
  currency?: string | null
): string {
  const value = Number(amount ?? 0);
  const code = currency?.trim().toUpperCase();

  if (!code) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  const locale = CURRENCY_LOCALES[code];

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
    }).format(value);
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
}
