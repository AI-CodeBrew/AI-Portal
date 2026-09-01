/**
 * Gemini embeddings for the rebuttals library.
 * Same model/dims as the mem0 vector store (gemini-embedding-001 @ 768) but
 * called directly, so admin-approved text is stored verbatim.
 * Soft-fails to null everywhere — an embedding outage must never break a reply.
 */
import { getActiveLlmConfig } from "@/lib/platform/llm-settings";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export const REBUTTAL_EMBEDDING_MODEL = "gemini-embedding-001";
export const REBUTTAL_EMBEDDING_DIMS = 768;

/** RETRIEVAL_DOCUMENT when storing a rebuttal, RETRIEVAL_QUERY when looking one
 * up or deduping — the model is trained on this asymmetry. */
export type EmbedTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

const MAX_EMBED_CHARS = 8000;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 100;

const cache = new Map<string, { vec: number[]; at: number }>();

function cacheGet(key: string): number[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.vec;
}

function cacheSet(key: string, vec: number[]): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { vec, at: Date.now() });
}

/** Truncated 768-dim outputs are not unit-norm (only the native 3072 are). */
function l2Normalize(values: number[]): number[] {
  let sum = 0;
  for (const v of values) sum += v * v;
  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm === 0) return values;
  return values.map((v) => v / norm);
}

export async function embedRebuttalText(
  text: string,
  taskType: EmbedTaskType
): Promise<number[] | null> {
  const trimmed = text.trim().slice(0, MAX_EMBED_CHARS);
  if (!trimmed) return null;

  const cacheKey = `${taskType}:${trimmed.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const llm = await getActiveLlmConfig();
    if (!llm.geminiApiKey) {
      console.warn("[rebuttals] no Gemini API key — skipping embed");
      return null;
    }

    const res = await fetch(
      `${GEMINI_API_BASE}/${REBUTTAL_EMBEDDING_MODEL}:embedContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": llm.geminiApiKey,
        },
        body: JSON.stringify({
          // Note: `content` singular, and taskType/outputDimensionality are
          // top-level here — unlike :generateContent.
          content: { parts: [{ text: trimmed }] },
          taskType,
          outputDimensionality: REBUTTAL_EMBEDDING_DIMS,
        }),
      }
    );

    if (!res.ok) {
      console.warn(
        `[rebuttals] embed failed: ${res.status}`,
        (await res.text()).slice(0, 200)
      );
      return null;
    }

    const json = (await res.json()) as {
      embedding?: { values?: number[] };
    };
    const values = json.embedding?.values;

    if (!Array.isArray(values) || values.length !== REBUTTAL_EMBEDDING_DIMS) {
      console.warn(
        `[rebuttals] unexpected embedding length: ${values?.length ?? "none"}`
      );
      return null;
    }

    const normalized = l2Normalize(values);
    cacheSet(cacheKey, normalized);
    return normalized;
  } catch (err) {
    console.warn(
      "[rebuttals] embed error:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
