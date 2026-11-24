/**
 * Supplier-confirmed OddsPapi limits, inspected against the feed client on
 * `work/oddspapi-v5-website` (not merged here). That client paces
 * `/fixtures/odds*` at 150ms and other endpoints at 350ms, and it keeps the
 * previous payload when the provider returns 429. It does not yet record the
 * WebSocket connection cap or the X-RateLimit header names.
 */
export const CONFIRMED_ODDSPAPI_LIMITS = {
  rest: {
    oddsPerSecond: 10,
    oddsPaths: ['/fixtures/odds', '/fixtures/odds/main'],
    otherPerMinute: 200,
    scope: 'per-api-key-and-endpoint',
    daily: null,
    monthly: null,
  },
  websocket: {
    connectionsPerKey: 8,
    fixtureCap: null,
    marketCap: null,
    messageRateCap: null,
    includedInMonthlyFee: true,
    resumeAfterDisconnect: true,
  },
  settlementPath: '/fixtures/settlement',
  reportedMedianLiveDelaySeconds: 1.8,
} as const;

export interface RateLimitBudget {
  limit: number;
  windowMs: number;
}

export function endpointBudget(path: string): RateLimitBudget {
  const oddsPaths: readonly string[] = CONFIRMED_ODDSPAPI_LIMITS.rest.oddsPaths;
  if (oddsPaths.includes(path)) return { limit: 10, windowMs: 1_000 };
  return { limit: 200, windowMs: 60_000 };
}

export interface ParsedRateLimit {
  limit: number | null;
  remaining: number | null;
  reset: number | null;
  retryAfterMs: number | null;
}

export function readRateLimitHeaders(headers: Record<string, string | undefined>): ParsedRateLimit {
  return {
    limit: integerHeader(headers['x-ratelimit-limit'] ?? headers['X-RateLimit-Limit']),
    remaining: integerHeader(headers['x-ratelimit-remaining'] ?? headers['X-RateLimit-Remaining']),
    reset: integerHeader(headers['x-ratelimit-reset'] ?? headers['X-RateLimit-Reset']),
    retryAfterMs: retryAfter(headers['retry-after'] ?? headers['Retry-After']),
  };
}

/** A 429 keeps the catalogue that was already stored. It never replaces it with an empty list. */
export function catalogueAfterResponse<T>(previous: T | null, status: number, next: T | null): T | null {
  if (status === 429) return previous;
  if (next == null) return previous;
  return next;
}

export function oddsAreActionable(quote: { suspended?: boolean; stale?: boolean; active?: boolean }): boolean {
  if (quote.suspended === true || quote.stale === true || quote.active === false) return false;
  return true;
}

export function allowProviderConnection(kind: 'shared-feed' | 'per-player' | 'per-frontend'): boolean {
  return kind === 'shared-feed';
}

export function mayDistributeToBrand(brandCode: string, authorized: readonly string[]): boolean {
  return authorized.includes(brandCode);
}

function integerHeader(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value);
}

function retryAfter(value: string | undefined): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value) * 1_000;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, parsed - Date.now());
}
