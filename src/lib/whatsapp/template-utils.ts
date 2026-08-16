/** Highest {{n}} index referenced in a WhatsApp template body — 0 if none.
 * Dependency-free so client components can import it without pulling in
 * server-only modules (this file must never import from "@/lib/whatsapp"). */
export function countBodyVariables(bodyText: string): number {
  const matches = bodyText.match(/\{\{\s*(\d+)\s*\}\}/g) ?? [];
  let max = 0;
  for (const m of matches) {
    const n = Number(m.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return max;
}
