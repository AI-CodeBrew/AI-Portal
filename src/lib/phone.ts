export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Build equivalent formats for matching WhatsApp conversations. */
export function phoneVariants(
  phone: string,
  hintPhone?: string | null
): string[] {
  const out = new Set<string>();
  const primary = toWhatsAppRecipient(phone, hintPhone);
  const digits = normalizePhone(phone);

  if (primary.length >= 10) out.add(primary);
  if (digits.length >= 10) out.add(digits);

  if (primary.startsWith("92") && primary.length === 12) {
    out.add(`0${primary.slice(2)}`);
    out.add(primary.slice(2));
  }

  if (digits.startsWith("0") && digits.length >= 11) {
    const intl = toWhatsAppRecipient(digits, hintPhone);
    if (intl.length >= 10) out.add(intl);
  }

  return Array.from(out);
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
  // PK mobile without leading 0, e.g. 3484787022 → 923484787022
  if (/^3\d{9}$/.test(digits)) return `92${digits}`;
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

/** Unique WhatsApp delivery targets, conversation number first when provided. */
export function buildWhatsAppRecipientTargets(
  phones: Array<string | null | undefined>,
  conversationPhone?: string | null
): string[] {
  const hint = conversationPhone?.trim() || null;
  const ordered: string[] = [];

  if (hint) {
    const chat = toWhatsAppRecipient(hint);
    if (chat.length >= 10) ordered.push(chat);
  }

  for (const raw of phones) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const target = toWhatsAppRecipient(trimmed, hint);
    if (target.length >= 10) ordered.push(target);
  }

  return Array.from(new Set(ordered));
}
