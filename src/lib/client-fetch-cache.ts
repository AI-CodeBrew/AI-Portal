/**
 * Tiny browser fetch cache: TTL + in-flight dedupe + stale-while-revalidate.
 * Stops remount/StrictMode double-hits and makes tab switches feel instant.
 */

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

export async function cachedJsonFetch<T>(
  key: string,
  url: string,
  opts?: {
    ttlMs?: number;
    /** If cached, return immediately and refresh in background */
    staleWhileRevalidate?: boolean;
    /** Skip cache read; still dedupes in-flight */
    force?: boolean;
  }
): Promise<{ data: T; fromCache: boolean; networkMs: number }> {
  const ttlMs = opts?.ttlMs ?? 30_000;
  const swr = opts?.staleWhileRevalidate ?? true;
  const force = opts?.force ?? false;
  const now = Date.now();
  const hit = !force ? cache.get(key) : undefined;

  if (hit && hit.expiresAt > now) {
    return { data: hit.payload as T, fromCache: true, networkMs: 0 };
  }

  if (hit && swr) {
    void revalidate<T>(key, url, ttlMs);
    return { data: hit.payload as T, fromCache: true, networkMs: 0 };
  }

  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const data = await revalidate<T>(key, url, ttlMs);
  const networkMs = Math.round(
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0
  );
  return { data, fromCache: false, networkMs };
}

async function revalidate<T>(
  key: string,
  url: string,
  ttlMs: number
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const p = (async () => {
    const res = await fetch(url);
    const json = (await res.json()) as T;
    cache.set(key, { expiresAt: Date.now() + ttlMs, payload: json });
    return json;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, p);
  return p;
}

export function peekCachedJson<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  return hit.payload as T;
}

/** Clear one key, or all keys starting with prefix (e.g. `inbox:list:`). */
export function invalidateCachedJson(keyOrPrefix: string): void {
  if (cache.has(keyOrPrefix)) {
    cache.delete(keyOrPrefix);
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(keyOrPrefix)) cache.delete(key);
  }
}
