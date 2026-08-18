import {
  getActiveLlmConfig,
  normalizeGeminiModel,
  resolveGeminiUtilityModel,
} from "@/lib/platform/llm-settings";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const TRANSCRIBE_PROMPT =
  "Transcribe this WhatsApp voice message exactly. Return only the spoken words with no commentary, labels, or punctuation unless clearly spoken. Preserve the original language (English, Urdu, Roman Urdu, Arabic, etc.).";

const MIN_TRANSCRIPT_CHARS = 2;

function normalizeMimeType(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() || "audio/ogg";
  if (base === "audio/opus") return "audio/ogg";
  return base;
}

/** Speech-to-text for inbound WhatsApp voice notes via Gemini. */
export async function transcribeVoiceNote(
  audio: Buffer,
  mimeType: string
): Promise<string | null> {
  const { geminiApiKey } = await getActiveLlmConfig();
  if (!geminiApiKey) return null;

  const model = normalizeGeminiModel(resolveGeminiUtilityModel());
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiApiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: normalizeMimeType(mimeType),
                data: audio.toString("base64"),
              },
            },
            { text: TRANSCRIBE_PROMPT },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(
      `[transcribe-audio] Gemini error model=${model} status=${res.status}:`,
      detail.slice(0, 400)
    );
    return null;
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text || text.length < MIN_TRANSCRIPT_CHARS) return null;
  return text;
}

export const VOICE_NOTE_UNCLEAR_REPLY =
  "Sorry, I couldn't understand the voice note — please type your message.";
