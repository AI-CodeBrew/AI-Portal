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

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(value);
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
}
