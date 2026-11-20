import type { V5Result } from './v5TrialClient.js';

/** Documented OddsPapi V5 limits: odds endpoints 10/s, every other endpoint 200/min, per key. */
export const V5_DOCUMENTED_LIMITS = { oddsPerSecond: 10, otherPerMinute: 200 } as const;
/** Stay under those limits when several Vercel instances share one key. */
export const V5_REQUEST_GAPS = { oddsMs: 150, otherMs: 350 } as const;

type Bucket = 'odds' | 'other';

interface MemoryEntry<T> {
  storedAt: number;
  freshUntil: number;
  keepUntil: number;
  result: V5Result<T>;
}

export type ScheduledResult<T> = V5Result<T> & { snapshotStale: boolean };

const memory = new Map<string, MemoryEntry<unknown>>();
const inflight = new Map<string, Promise<ScheduledResult<unknown>>>();
const pauseUntil: Record<Bucket, number> = { odds: 0, other: 0 };
const nextAt: Record<Bucket, number> = { odds: 0, other: 0 };
let chain: Promise<void> = Promise.resolve();

export function clearV5RequestSchedule(): void {
  memory.clear();
  inflight.clear();
  pauseUntil.odds = 0;
  pauseUntil.other = 0;
  nextAt.odds = 0;
  nextAt.other = 0;
  chain = Promise.resolve();
}

function bucketFor(key: string): Bucket {
  return key.startsWith('odds:') ? 'odds' : 'other';
}

function gapFor(bucket: Bucket): number {
  return bucket === 'odds' ? V5_REQUEST_GAPS.oddsMs : V5_REQUEST_GAPS.otherMs;
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(() => undefined, () => undefined);
  return run;
}

function withJitter(baseMs: number): number {
  const spread = Math.min(250, Math.max(40, Math.floor(baseMs * 0.2)));
  return baseMs + Math.floor(Math.random() * spread);
}

export function noteV5RateLimit(bucket: Bucket, retryAfterMs: number | null, now = Date.now()): number {
  const requested = retryAfterMs != null && retryAfterMs >= 0 ? retryAfterMs : 1_000;
  const cap = bucket === 'odds' ? 5_000 : 30_000;
  const until = now + withJitter(Math.min(cap, Math.max(requested, 250)));
  pauseUntil[bucket] = Math.max(pauseUntil[bucket], until);
  void writeShared(`pause:${bucket}`, { until }, Math.max(1, Math.ceil((until - now) / 1000)));
  return until;
}

interface SharedCache {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown, options: { ttl: number; name: string }) => Promise<unknown>;
}

let sharedCache: Promise<SharedCache | null> | null = null;

function sharedEnabled(): boolean {
  return process.env.VERCEL === '1';
}

async function shared(): Promise<SharedCache | null> {
  if (!sharedEnabled()) return null;
  if (!sharedCache) {
    sharedCache = import('@vercel/functions')
      .then((mod) => mod.getCache({ namespace: 'oddspapi-v5' }) as SharedCache)
      .catch(() => null);
  }
  return sharedCache;
}

async function readShared<T>(key: string): Promise<T | null> {
  try {
    const cache = await shared();
    if (!cache) return null;
    const value = await cache.get(key);
    return value && typeof value === 'object' ? value as T : null;
  } catch {
    return null;
  }
}

async function writeShared(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const cache = await shared();
    if (!cache) return;
    const encoded = JSON.stringify(value);
    if (encoded.length > 900_000) return;
    await cache.set(key, value, { ttl: ttlSeconds, name: 'oddspapi-v5' });
  } catch {
    return undefined;
  }
}

async function pauseAt(bucket: Bucket, now: number): Promise<number> {
  if (pauseUntil[bucket] > now) return pauseUntil[bucket];
  const saved = await readShared<{ until?: unknown }>(`pause:${bucket}`);
  const until = typeof saved?.until === 'number' ? saved.until : 0;
  if (until > pauseUntil[bucket]) pauseUntil[bucket] = until;
  return pauseUntil[bucket];
}

async function reserveSlot(bucket: Bucket, now: number): Promise<number> {
  const saved = await readShared<{ at?: unknown }>(`next:${bucket}`);
  const sharedAt = typeof saved?.at === 'number' ? saved.at : 0;
  const slot = Math.max(now, nextAt[bucket], sharedAt);
  const following = slot + gapFor(bucket);
  nextAt[bucket] = following;
  await writeShared(`next:${bucket}`, { at: following }, 120);
  return slot;
}

function fallbackFor<T>(local: MemoryEntry<T> | undefined, remote: MemoryEntry<T> | null, now: number): MemoryEntry<T> | null {
  if (local && local.keepUntil > now) return local;
  if (remote && remote.keepUntil > now) return remote;
  return null;
}

export async function scheduledRead<T>(
  key: string,
  freshMs: number,
  keepMs: number,
  load: () => Promise<V5Result<T>>,
): Promise<ScheduledResult<T>> {
  const now = Date.now();
  const fresh = memory.get(key) as MemoryEntry<T> | undefined;
  if (fresh && fresh.freshUntil > now) return { ...fresh.result, snapshotStale: false };
  const pending = inflight.get(key) as Promise<ScheduledResult<T>> | undefined;
  if (pending) return pending;

  const run = enqueue(async (): Promise<ScheduledResult<T>> => {
    const current = Date.now();
    const local = memory.get(key) as MemoryEntry<T> | undefined;
    if (local && local.freshUntil > current) return { ...local.result, snapshotStale: false };
    const remote = await readShared<MemoryEntry<T>>(key);
    if (remote && remote.freshUntil > Date.now() && remote.result) {
      memory.set(key, remote as MemoryEntry<unknown>);
      return { ...remote.result, snapshotStale: false };
    }
    const bucket = bucketFor(key);
    const kept = fallbackFor(local, remote, Date.now());
    if ((await pauseAt(bucket, Date.now())) > Date.now()) {
      if (kept) return { ...kept.result, snapshotStale: true };
      return { ok: false, status: 429, error: 'RATE_LIMITED', data: null, snapshotStale: false };
    }
    const slot = await reserveSlot(bucket, Date.now());
    const wait = slot - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if ((await pauseAt(bucket, Date.now())) > Date.now()) {
      if (kept) return { ...kept.result, snapshotStale: true };
      return { ok: false, status: 429, error: 'RATE_LIMITED', data: null, snapshotStale: false };
    }
    const result = await load();
    if (result.status === 429 || result.error === 'RATE_LIMITED') {
      noteV5RateLimit(bucket, result.retryAfterMs ?? null);
      if (kept) return { ...kept.result, snapshotStale: true };
      return { ...result, snapshotStale: false };
    }
    if (!result.ok || result.data === null) {
      if (kept) return { ...kept.result, snapshotStale: true };
      return { ...result, snapshotStale: false };
    }
    const storedAt = Date.now();
    const entry: MemoryEntry<T> = {
      storedAt,
      freshUntil: storedAt + freshMs,
      keepUntil: storedAt + keepMs,
      result,
    };
    memory.set(key, entry as MemoryEntry<unknown>);
    await writeShared(key, entry, Math.max(60, Math.ceil(keepMs / 1000)));
    return { ...result, snapshotStale: false };
  });

  inflight.set(key, run as Promise<ScheduledResult<unknown>>);
  try {
    return await run;
  } finally {
    if (inflight.get(key) === run) inflight.delete(key);
  }
}
