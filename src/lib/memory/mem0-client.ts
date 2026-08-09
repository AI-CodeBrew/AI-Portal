/**
 * Mem0 long-term memory via Supabase Postgres + pgvector.
 * Soft-fails when unset — layers 1–4 still work.
 *
 * Vector store: pgvector (DATABASE_URL) preferred; or supabase URL+service key.
 * Embeddings: Gemini via GEMINI_API_KEY (gemini-embedding-001, 768 dims).
 * LLM extract: Gemini utility model.
 */
import { getActiveLlmConfig } from "@/lib/platform/llm-settings";
import { isMemoryEnabled } from "./session-key";
import type { RecalledMemory } from "./types";

/** Match gemini-embedding-001 outputDimensionality used in vector store. */
const GEMINI_EMBEDDING_DIMS = 768;
const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";

type MemoryInstance = {
  search: (
    query: string,
    opts: {
      topK?: number;
      filters?: { user_id?: string };
    }
  ) => Promise<{ results?: Array<{ id?: string; memory?: string; score?: number }> }>;
  add: (
    messages: Array<{ role: string; content: string }>,
    opts: { userId?: string }
  ) => Promise<unknown>;
};

let memoryPromise: Promise<MemoryInstance | null> | null = null;

function buildVectorStoreConfig(): Record<string, unknown> | null {
  // Prefer Supabase HTTPS client — works in serverless and when db.* DNS/IPv6 fails.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (supabaseUrl && supabaseKey) {
    return {
      provider: "supabase",
      config: {
        supabaseUrl,
        supabaseKey,
        // Mem0 Supabase provider expects this table + match_vectors() — see 040_mem0_vector_store.sql
        tableName: "memories",
        embeddingModelDims: GEMINI_EMBEDDING_DIMS,
      },
    };
  }

  const connectionString = process.env.DATABASE_URL?.trim();
  if (connectionString) {
    return {
      provider: "pgvector",
      config: {
        connectionString,
        collectionName: "mem0_memories",
        embeddingModelDims: GEMINI_EMBEDDING_DIMS,
        hnsw: true,
      },
    };
  }

  return null;
}

async function getMemory(): Promise<MemoryInstance | null> {
  if (!isMemoryEnabled()) return null;
  if (memoryPromise) return memoryPromise;

  memoryPromise = (async () => {
    const vectorStore = buildVectorStoreConfig();
    if (!vectorStore) {
      console.warn(
        "[mem0] Set DATABASE_URL (preferred) or Supabase URL+service key for long-term memory"
      );
      return null;
    }

    const llm = await getActiveLlmConfig();
    const geminiKey = llm.geminiApiKey;
    if (!geminiKey) {
      console.warn(
        "[mem0] GEMINI_API_KEY required for embeddings — long-term memory disabled until set"
      );
      return null;
    }

    try {
      const mod = await import("mem0ai/oss");
      const MemoryCtor = (mod as { Memory: new (cfg: unknown) => MemoryInstance })
        .Memory;

      const config: Record<string, unknown> = {
        version: "v1.1",
        vectorStore,
        embedder: {
          provider: "google",
          config: {
            apiKey: geminiKey,
            model: GEMINI_EMBEDDING_MODEL,
            embeddingDims: GEMINI_EMBEDDING_DIMS,
          },
        },
        llm: {
          provider: "google",
          config: {
            apiKey: geminiKey,
            model: llm.geminiUtilityModel,
          },
        },
      };

      return new MemoryCtor(config);
    } catch (err) {
      console.warn(
        "[mem0] init failed:",
        err instanceof Error ? err.message : err
      );
      return null;
    }
  })();

  return memoryPromise;
}

export async function recallMemories(
  sessionKey: string,
  query: string,
  limit = 5
): Promise<RecalledMemory[]> {
  if (!query.trim()) return [];
  try {
    const memory = await getMemory();
    if (!memory) return [];

    const res = await memory.search(query, {
      topK: limit,
      filters: { user_id: sessionKey },
    });
    const results = res?.results ?? [];
    return results
      .map((r) => ({
        id: r.id,
        memory: (r.memory ?? "").trim(),
        score: r.score,
      }))
      .filter((r) => r.memory.length > 0);
  } catch (err) {
    console.warn("[mem0] recall failed:", err);
    return [];
  }
}

export async function extractAndStoreMemories(params: {
  sessionKey: string;
  userMessage: string;
  assistantReply: string;
}): Promise<void> {
  const { sessionKey, userMessage, assistantReply } = params;
  if (!userMessage.trim() || !assistantReply.trim()) return;

  try {
    const memory = await getMemory();
    if (!memory) return;

    await memory.add(
      [
        { role: "user", content: userMessage },
        { role: "assistant", content: assistantReply },
      ],
      { userId: sessionKey }
    );
  } catch (err) {
    console.warn("[mem0] extract/store failed:", err);
  }
}
