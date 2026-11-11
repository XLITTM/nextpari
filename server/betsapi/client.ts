import {
  BACKOFF_START_MS,
  readRateLimitHeaders,
  SharedRequestBudget,
  type HeaderBag,
  type SharedBudgetOptions,
} from './budget.js';
import { normalizeFootballDetails, normalizeFootballList } from './parse.js';
import {
  FOOTBALL_SPORT_ID,
  type FeedEndpoint,
  type FeedResult,
  type NormalizedEvent,
  type NormalizedFeed,
  type RateLimitSnapshot,
} from './types.js';

export const BETSAPI_PRIMARY_HOST = 'https://api.b365api.com';
export const BETSAPI_FALLBACK_HOST = 'https://api.betsapi.com';
const MAX_BODY_CHARS = 2_000_000;
const DEFAULT_TIMEOUT_MS = 8_000;

const PATHS = {
  inplay: '/v3/events/inplay',
  upcoming: '/v3/events/upcoming',
  ended: '/v3/events/ended',
  view: '/v1/event/view',
  odds: '/v2/event/odds',
} as const;

const FRESH_MS: Record<FeedEndpoint | 'odds', number> = {
  inplay: 12_000,
  upcoming: 60_000,
  ended: 120_000,
  event: 15_000,
  odds: 15_000,
};

const STALE_MS: Record<FeedEndpoint | 'odds', number> = {
  inplay: 60_000,
  upcoming: 10 * 60_000,
  ended: 30 * 60_000,
  event: 60_000,
  odds: 60_000,
};

type CacheKind = FeedEndpoint | 'odds';

interface CacheEntry {
  storedAt: number;
  events: NormalizedEvent[];
  endpoint: FeedEndpoint;
  rateLimit: RateLimitSnapshot | null;
}

export interface BetsApiReadOnlyClientOptions extends SharedBudgetOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  freshMs?: Partial<Record<CacheKind, number>>;
  staleMs?: Partial<Record<CacheKind, number>>;
  hosts?: readonly string[];
}

interface UpstreamResult {
  status: number;
  json: unknown | null;
  headers: HeaderBag;
  timedOut: boolean;
  networkError: boolean;
}

function tokenFrom(env: NodeJS.ProcessEnv | undefined): string {
  return String(env?.BETSAPI_TOKEN || env?.BETSAPI_KEY || '').trim();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function snapshotOf(observation: ReturnType<typeof readRateLimitHeaders>): RateLimitSnapshot {
  return {
    remaining: observation.remaining,
    limit: observation.limit,
    resetAt: observation.resetAtMs != null ? new Date(observation.resetAtMs).toISOString() : null,
  };
}

function emptyHeaders(): HeaderBag {
  return { get: () => null };
}

export class BetsApiReadOnlyClient {
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly hosts: readonly string[];
  private readonly budget: SharedRequestBudget;
  private readonly now: () => number;
  private readonly freshMs: Record<CacheKind, number>;
  private readonly staleMs: Record<CacheKind, number>;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<FeedResult>>();

  constructor(options: BetsApiReadOnlyClientOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.hosts = options.hosts ?? [BETSAPI_PRIMARY_HOST, BETSAPI_FALLBACK_HOST];
    this.now = options.now ?? (() => Date.now());
    this.budget = new SharedRequestBudget({
      now: this.now,
      sleep: options.sleep,
      minGapMs: options.minGapMs,
    });
    this.freshMs = { ...FRESH_MS, ...options.freshMs };
    this.staleMs = { ...STALE_MS, ...options.staleMs };
  }

  getInplay(): Promise<FeedResult> {
    return this.cached('inplay', PATHS.inplay, { sport_id: FOOTBALL_SPORT_ID }, (json) => (
      normalizeFootballList(json, 'inplay')
    ));
  }

  getUpcoming(page = 1): Promise<FeedResult> {
    const safePage = Number.isInteger(page) && page >= 1 && page <= 5 ? page : 1;
    return this.cached('upcoming', PATHS.upcoming, { sport_id: FOOTBALL_SPORT_ID, page: String(safePage) }, (json) => (
      normalizeFootballList(json, 'upcoming')
    ));
  }

  getEnded(day: string): Promise<FeedResult> {
    return this.cached('ended', PATHS.ended, { sport_id: FOOTBALL_SPORT_ID, day }, (json) => (
      normalizeFootballList(json, 'ended')
    ));
  }

  getEventResult(eventId: string): Promise<FeedResult> {
    if (!/^\d{1,20}$/.test(eventId)) {
      return Promise.resolve({ ok: false, error: 'UPSTREAM', upstreamStatus: null, feed: null });
    }
    return this.cached('event', PATHS.view, { event_id: eventId }, (json) => {
      const row = normalizeFootballDetails(json, null);
      return row ? [row] : [];
    });
  }

  getEvent(eventId: string): Promise<FeedResult> {
    const key = `event:${eventId}`;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const run = this.loadEvent(eventId).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, run);
    return run;
  }

  private cached(
    endpoint: FeedEndpoint,
    path: string,
    query: Record<string, string>,
    parse: (json: unknown) => NormalizedEvent[],
  ): Promise<FeedResult> {
    const key = `${endpoint}:${new URLSearchParams(query).toString()}`;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const run = this.loadCached(endpoint, key, path, query, parse).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, run);
    return run;
  }

  private loadCached(
    endpoint: FeedEndpoint,
    key: string,
    path: string,
    query: Record<string, string>,
    parse: (json: unknown) => NormalizedEvent[],
  ): Promise<FeedResult> {
    const cached = this.cache.get(key);
    const age = cached ? this.now() - cached.storedAt : Number.POSITIVE_INFINITY;
    if (cached && age <= this.freshMs[endpoint]) {
      return Promise.resolve(this.ok(cached, false, false));
    }
    return this.refresh(endpoint, key, path, query, parse, cached ?? null);
  }

  private async refresh(
    endpoint: FeedEndpoint,
    key: string,
    path: string,
    query: Record<string, string>,
    parse: (json: unknown) => NormalizedEvent[],
    cached: CacheEntry | null,
  ): Promise<FeedResult> {
    const token = tokenFrom(this.env);
    if (!token) return { ok: false, error: 'TOKEN_MISSING', upstreamStatus: null, feed: null };
    const upstream = await this.fetchAllowlisted(path, query, token);
    if (upstream.timedOut) return this.failed('TIMEOUT', cached, endpoint, upstream.status);
    if (upstream.status === 429) {
      this.budget.noteRateLimit(readRateLimitHeaders(upstream.headers, this.now()));
      return this.failed('RATE_LIMITED', cached, endpoint, 429, snapshotOf(readRateLimitHeaders(upstream.headers, this.now())));
    }
    if (upstream.networkError || upstream.status < 200 || upstream.status >= 300 || !accepted(upstream.json)) {
      return this.failed('UPSTREAM', cached, endpoint, upstream.status || null);
    }
    const observation = readRateLimitHeaders(upstream.headers, this.now());
    this.budget.noteSuccess();
    this.budget.noteRemainingExhausted(observation);
    const entry: CacheEntry = {
      storedAt: this.now(),
      events: parse(upstream.json),
      endpoint,
      rateLimit: snapshotOf(observation),
    };
    this.cache.set(key, entry);
    return this.ok(entry, false, false);
  }

  private async loadEvent(eventId: string): Promise<FeedResult> {
    const viewKey = `event:${eventId}`;
    const cached = this.cache.get(viewKey) ?? null;
    const age = cached ? this.now() - cached.storedAt : Number.POSITIVE_INFINITY;
    if (cached && age <= this.freshMs.event) return this.ok(cached, false, false);
    const token = tokenFrom(this.env);
    if (!token) return { ok: false, error: 'TOKEN_MISSING', upstreamStatus: null, feed: null };
    const view = await this.fetchAllowlisted(PATHS.view, { event_id: eventId }, token);
    if (view.timedOut) return this.failed('TIMEOUT', cached, 'event', view.status);
    if (view.status === 429) {
      const observation = readRateLimitHeaders(view.headers, this.now());
      this.budget.noteRateLimit(observation);
      return this.failed('RATE_LIMITED', cached, 'event', 429, snapshotOf(observation));
    }
    if (view.networkError || view.status < 200 || view.status >= 300 || !accepted(view.json)) {
      return this.failed('UPSTREAM', cached, 'event', view.status || null);
    }
    const viewObservation = readRateLimitHeaders(view.headers, this.now());
    this.budget.noteSuccess();
    this.budget.noteRemainingExhausted(viewObservation);

    let oddsPayload: unknown | null = null;
    let oddsRate: RateLimitSnapshot | null = null;
    let oddsLimited = false;
    const odds = await this.fetchAllowlisted(PATHS.odds, { event_id: eventId }, token);
    if (odds.status === 429) {
      const observation = readRateLimitHeaders(odds.headers, this.now());
      this.budget.noteRateLimit(observation);
      oddsRate = snapshotOf(observation);
      oddsLimited = true;
    } else if (!odds.timedOut && !odds.networkError && odds.status >= 200 && odds.status < 300 && accepted(odds.json)) {
      const observation = readRateLimitHeaders(odds.headers, this.now());
      this.budget.noteSuccess();
      this.budget.noteRemainingExhausted(observation);
      oddsPayload = odds.json;
      oddsRate = snapshotOf(observation);
    }
    const event = normalizeFootballDetails(view.json, oddsLimited ? null : oddsPayload);
    const entry: CacheEntry = {
      storedAt: this.now(),
      events: event ? [event] : [],
      endpoint: 'event',
      rateLimit: oddsRate ?? snapshotOf(viewObservation),
    };
    this.cache.set(viewKey, entry);
    return this.ok(entry, false, oddsLimited);
  }

  private failed(
    error: 'TIMEOUT' | 'RATE_LIMITED' | 'UPSTREAM',
    cached: CacheEntry | null,
    endpoint: FeedEndpoint,
    status: number | null,
    rateLimit?: RateLimitSnapshot,
  ): FeedResult {
    if (cached && this.now() - cached.storedAt <= this.staleMs[endpoint]) {
      const feed = this.envelope(cached, true, error === 'RATE_LIMITED');
      if (rateLimit) feed.rateLimit = rateLimit;
      return { ok: true, error: null, upstreamStatus: status, feed };
    }
    const code = cached ? 'STALE' : error;
    return { ok: false, error: code, upstreamStatus: status, feed: null };
  }

  private ok(entry: CacheEntry, stale: boolean, rateLimited: boolean): FeedResult {
    return {
      ok: true,
      error: null,
      upstreamStatus: 200,
      feed: this.envelope(entry, stale, rateLimited),
    };
  }

  private envelope(entry: CacheEntry, stale: boolean, rateLimited: boolean): NormalizedFeed {
    const at = new Date(entry.storedAt).toISOString();
    return {
      source: 'betsapi',
      mode: 'read-only',
      betting: 'disabled',
      settlement: 'disabled',
      endpoint: entry.endpoint,
      sportId: FOOTBALL_SPORT_ID,
      fetchedAt: at,
      updatedAt: at,
      stale,
      rateLimited,
      rateLimit: entry.rateLimit,
      events: entry.events,
    };
  }

  private async fetchAllowlisted(
    path: string,
    query: Record<string, string>,
    token: string,
  ): Promise<UpstreamResult> {
    let last: UpstreamResult = {
      status: 0,
      json: null,
      headers: emptyHeaders(),
      timedOut: false,
      networkError: true,
    };
    for (let index = 0; index < this.hosts.length; index += 1) {
      const host = this.hosts[index];
      const attempt = await this.budget.schedule(() => this.fetchHost(host, path, query, token));
      last = attempt;
      if (attempt.status === 429 || (attempt.status >= 400 && attempt.status < 500)) return attempt;
      if (attempt.timedOut || attempt.networkError || attempt.status >= 500) {
        if (index < this.hosts.length - 1) continue;
      }
      return attempt;
    }
    return last;
  }

  private async fetchHost(
    host: string,
    path: string,
    query: Record<string, string>,
    token: string,
  ): Promise<UpstreamResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = new URL(path, host);
      const params = new URLSearchParams(query);
      params.set('token', token);
      url.search = params.toString();
      const response = await this.fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const body = await response.text();
      if (body.length > MAX_BODY_CHARS) {
        return { status: response.status, json: null, headers: response.headers, timedOut: false, networkError: false };
      }
      let json: unknown = null;
      try {
        json = body ? JSON.parse(body) as unknown : null;
      } catch {
        json = null;
      }
      return { status: response.status, json, headers: response.headers, timedOut: false, networkError: false };
    } catch (error) {
      return {
        status: 0,
        json: null,
        headers: emptyHeaders(),
        timedOut: isAbortError(error),
        networkError: !isAbortError(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function accepted(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false;
  return Number((json as { success?: unknown }).success) === 1;
}

let shared: BetsApiReadOnlyClient | null = null;

export function getSharedBetsApiClient(options?: BetsApiReadOnlyClientOptions): BetsApiReadOnlyClient {
  if (!shared) {
    shared = new BetsApiReadOnlyClient({
      ...options,
      minGapMs: options?.minGapMs ?? 12_000,
    });
  }
  return shared;
}

export function resetSharedBetsApiClient(): void {
  shared = null;
}

export { BACKOFF_START_MS };
