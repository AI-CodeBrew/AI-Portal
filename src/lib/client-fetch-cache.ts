/**
 * Browser fetch cache: TTL + in-flight dedupe + stale-while-revalidate.
 * Survives tab switches (module memory + sessionStorage). Mutations can
 * patch a key instead of refetching the whole payload.
 */

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<(payload: unknown) => void>>();

const STORAGE_KEY = "portal:fetch-cache:v1";
const MAX_PERSIST_BYTES = 1_400_000;

function canUseStorage() {
  return typeof sessionStorage !== "undefined";
}

let sessionHydrationEnabled = false;

function hydrateFromSession() {
  if (!sessionHydrationEnabled || !canUseStorage() || cache.size > 0) return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    for (const [key, entry] of Object.entries(parsed)) {
      if (entry && typeof entry === "object" && "payload" in entry) {
        cache.set(key, entry);
      }
    }
  } catch {
    // ignore corrupt cache
  }
}

/** Call after mount so SSR/first paint cannot read sessionStorage. */
export function enableClientFetchCacheHydration() {
  sessionHydrationEnabled = true;
  hydrateFromSession();
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistToSession() {
  if (!canUseStorage()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const out: Record<string, CacheEntry> = {};
      for (const [key, entry] of cache) {
        out[key] = entry;
      }
      const json = JSON.stringify(out);
      if (json.length <= MAX_PERSIST_BYTES) {
        sessionStorage.setItem(STORAGE_KEY, json);
      }
    } catch {
      // quota / private mode
    }
  }, 200);
}

function writeEntry(key: string, payload: unknown, ttlMs: number) {
  cache.set(key, { expiresAt: Date.now() + ttlMs, payload });
  persistToSession();
  const subs = listeners.get(key);
  if (subs) {
    for (const fn of subs) fn(payload);
  }
}

export function peekCachedJson<T>(key: string): T | null {
  hydrateFromSession();
  const hit = cache.get(key);
  if (!hit) return null;
  return hit.payload as T;
}

export function setCachedJson<T>(key: string, payload: T, ttlMs = 60_000): void {
  writeEntry(key, payload, ttlMs);
}

export function prefetchJson(
  key: string,
  url: string,
  ttlMs = 60_000
): void {
  if (cache.has(key)) return;
  void cachedJsonFetch(key, url, { ttlMs, staleWhileRevalidate: true });
}

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
  hydrateFromSession();
  const ttlMs = opts?.ttlMs ?? 30_000;
  const swr = opts?.staleWhileRevalidate ?? true;
  const force = opts?.force ?? false;
  const now = Date.now();
  const hit = !force ? cache.get(key) : undefined;

  if (hit) {
    if (swr && hit.expiresAt <= now) {
      void revalidate<T>(key, url, ttlMs);
    }
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
    writeEntry(key, json, ttlMs);
    return json;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, p);
  return p;
}

/** Clear one key, or all keys starting with prefix (e.g. `inbox:list:`). */
export function invalidateCachedJson(keyOrPrefix: string): void {
  if (cache.has(keyOrPrefix)) {
    cache.delete(keyOrPrefix);
    persistToSession();
    return;
  }
  let removed = false;
  for (const key of cache.keys()) {
    if (key.startsWith(keyOrPrefix)) {
      cache.delete(key);
      removed = true;
    }
  }
  if (removed) persistToSession();
}
