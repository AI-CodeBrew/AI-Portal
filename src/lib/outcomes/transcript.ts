import type { ExtractedOutcome, ObjectionType, CustomerTone } from "./types";

const VALID_OBJECTIONS = new Set([
  "price",
  "authenticity",
  "delivery_time",
  "none",
  "other",
]);

const VALID_TONES = new Set([
  "direct",
  "hesitant",
  "price-sensitive",
  "enthusiastic",
]);

const VALID_STAGES = new Set([
  "greeting",
  "product_presentation",
  "qualifying",
  "objection_handling",
  "closing",
  "order_confirmation",
  "post_order",
]);

export function formatTranscript(
  messages: Array<{ direction: string; content: string; created_at?: string }>
): string {
  return messages
    .map((m) => {
      const role = m.direction === "in" ? "Customer" : "Agent";
      const body = m.content.replace(/\s+/g, " ").trim();
      return `${role}: ${body}`;
    })
    .join("\n");
}

export function buildExtractionUserPrompt(transcript: string): string {
  return `CONVERSATION TRANSCRIPT:\n${transcript}`;
}

export function parseExtractedOutcome(raw: string): ExtractedOutcome | null {
  let jsonText = raw.trim();
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) jsonText = fence[1].trim();
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  jsonText = jsonText.slice(start, end + 1);

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const objection = String(parsed.objection_type ?? "none").toLowerCase();
    if (!VALID_OBJECTIONS.has(objection)) return null;

    const tone = String(parsed.customer_tone ?? "direct").toLowerCase();
    if (!VALID_TONES.has(tone)) return null;

    const stagesRaw = Array.isArray(parsed.stages_observed)
      ? parsed.stages_observed
      : [];
    const stages = stagesRaw
      .map((s) => String(s).toLowerCase())
      .filter((s) => VALID_STAGES.has(s));

    const messagesToClose = Number(parsed.messages_to_close);
    if (!Number.isFinite(messagesToClose) || messagesToClose < 1) return null;

    const keyClosing = String(parsed.key_closing_line ?? "").trim();
    const whatWorked = String(parsed.what_worked ?? "").trim();
    if (!keyClosing || !whatWorked) return null;

    const handling =
      parsed.objection_handling_message == null
        ? null
        : String(parsed.objection_handling_message).trim() || null;

    return {
      objection_type: objection as ObjectionType,
      objection_handling_message: handling,
      messages_to_close: Math.round(messagesToClose),
      stages_observed: stages as ExtractedOutcome["stages_observed"],
      key_closing_line: keyClosing.slice(0, 2000),
      customer_tone: tone as CustomerTone,
      what_worked: whatWorked.slice(0, 1000),
    };
  } catch {
    return null;
  }
}

/** Trim transcript for prompt injection — keep pacing, drop huge blocks. */
export function formatTranscriptSnippet(
  messages: Array<{ direction: string; content: string }>,
  maxLines = 24
): string {
  const lines = messages.map((m) => {
    const role = m.direction === "in" ? "Customer" : "Agent";
    return `${role}: ${m.content.replace(/\s+/g, " ").trim()}`;
  });
  if (lines.length <= maxLines) return lines.join("\n");
  const head = lines.slice(0, 6);
  const tail = lines.slice(-maxLines + 7);
  return [...head, "…", ...tail].join("\n");
}
