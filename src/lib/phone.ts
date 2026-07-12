export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * WhatsApp Cloud API needs an international number (digits only, no +).
 * Converts local numbers like 03XXXXXXXXX → 923XXXXXXXXX using known patterns
 * or a hint (e.g. the WhatsApp chat `from` number) for country code.
 */
export function toWhatsAppRecipient(
  phone: string,
  hintPhone?: string | null
): string {
  let digits = normalizePhone(phone);
  if (!digits) return "";

  if (digits.startsWith("00")) digits = digits.slice(2);

  if (!digits.startsWith("0") && digits.length >= 11 && digits.length <= 15) {
    return digits;
  }

  if (/^03\d{9}$/.test(digits)) return `92${digits.slice(1)}`;
  if (/^05\d{8}$/.test(digits)) return `971${digits.slice(1)}`;
  if (/^05\d{9}$/.test(digits)) return `966${digits.slice(1)}`;
  if (/^01\d{9}$/.test(digits)) return `20${digits.slice(1)}`;

  const hint = hintPhone ? normalizePhone(hintPhone) : "";

  const countryCodes = [
    "971",
    "966",
    "974",
    "973",
    "968",
    "965",
    "961",
    "880",
    "92",
    "91",
    "94",
    "62",
    "60",
    "65",
    "44",
    "1",
  ];

  if (digits.startsWith("0") && hint.length >= 10) {
    const national = digits.slice(1);
    if (hint.endsWith(national)) return hint;
    for (const cc of countryCodes) {
      if (hint.startsWith(cc)) return `${cc}${national}`;
    }
    if (hint.length > national.length) {
      return `${hint.slice(0, hint.length - national.length)}${national}`;
    }
  }

  if (!digits.startsWith("0") && digits.length <= 10 && hint.length >= 11) {
    for (const cc of countryCodes) {
      if (hint.startsWith(cc)) return `${cc}${digits}`;
    }
  }

  return digits;
}
