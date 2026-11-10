export const MIN_REQUEST_GAP_MS = 12_000;
export const BACKOFF_START_MS = 60_000;
export const BACKOFF_MAX_MS = 300_000;

export interface RateLimitObservation {
  remaining: number | null;
  limit: number | null;
  resetAtMs: number | null;
  retryAfterMs: number | null;
}

export interface HeaderBag {
  get(name: string): string | null;
}

function header(headers: HeaderBag, name: string): string {
  return String(headers.get(name) ?? headers.get(name.toLowerCase()) ?? '').trim();
}

function finiteNumber(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readRateLimitHeaders(headers: HeaderBag, now: number): RateLimitObservation {
  const remaining = finiteNumber(
    header(headers, 'x-ratelimit-remaining') || header(headers, 'x-rate-limit-remaining'),
  );
  const limit = finiteNumber(
    header(headers, 'x-ratelimit-limit') || header(headers, 'x-rate-limit-limit'),
  );
  const resetRaw = finiteNumber(
    header(headers, 'x-ratelimit-reset') || header(headers, 'x-rate-limit-reset'),
  );
  let resetAtMs: number | null = null;
  if (resetRaw != null && resetRaw > 0) {
    if (resetRaw > 1_000_000_000_000) resetAtMs = resetRaw;
    else if (resetRaw > 1_000_000_000) resetAtMs = resetRaw * 1000;
    else resetAtMs = now + resetRaw * 1000;
  }

  const retryRaw = header(headers, 'retry-after');
  let retryAfterMs: number | null = null;
  if (retryRaw) {
    const seconds = Number(retryRaw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      retryAfterMs = seconds * 1000;
    } else {
      const dated = Date.parse(retryRaw);
      if (Number.isFinite(dated)) retryAfterMs = Math.max(0, dated - now);
    }
  }

  return { remaining, limit, resetAtMs, retryAfterMs };
}

export interface SharedBudgetOptions {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  minGapMs?: number;
}

export class SharedRequestBudget {
  private chain: Promise<void> = Promise.resolve();
  private nextAt = 0;
  private backoffUntil = 0;
  private backoffMs = BACKOFF_START_MS;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly minGapMs: number;

  constructor(options: SharedBudgetOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => {
      setTimeout(resolve, ms);
    }));
    this.minGapMs = options.minGapMs ?? MIN_REQUEST_GAP_MS;
  }

  async schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const wait = Math.max(0, Math.max(this.nextAt, this.backoffUntil) - this.now());
      if (wait > 0) await this.sleep(wait);
      try {
        return await task();
      } finally {
        this.nextAt = this.now() + this.minGapMs;
      }
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  noteSuccess(): void {
    this.backoffMs = BACKOFF_START_MS;
    this.backoffUntil = 0;
  }

  noteRateLimit(observation: RateLimitObservation): number {
    const now = this.now();
    const resetWait = observation.resetAtMs != null ? Math.max(0, observation.resetAtMs - now) : 0;
    const requested = observation.retryAfterMs != null
      ? Math.max(observation.retryAfterMs, resetWait)
      : Math.max(this.backoffMs, resetWait);
    const pause = Math.min(Math.max(requested, BACKOFF_START_MS), BACKOFF_MAX_MS);
    this.backoffUntil = now + pause;
    if (observation.retryAfterMs == null) {
      this.backoffMs = Math.min(Math.max(this.backoffMs, BACKOFF_START_MS) * 2, BACKOFF_MAX_MS);
    } else {
      this.backoffMs = BACKOFF_START_MS;
    }
    return pause;
  }

  noteRemainingExhausted(observation: RateLimitObservation): void {
    if (observation.remaining !== 0) return;
    const now = this.now();
    const resetWait = observation.resetAtMs != null ? Math.max(0, observation.resetAtMs - now) : BACKOFF_START_MS;
    const pause = Math.min(Math.max(resetWait, BACKOFF_START_MS), BACKOFF_MAX_MS);
    this.backoffUntil = Math.max(this.backoffUntil, now + pause);
  }
}
