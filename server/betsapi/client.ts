import { configuredAdditionalSports, type EventsSportId } from './sportIds.js';
import {
  BACKOFF_START_MS,
  readRateLimitHeaders,
  SharedRequestBudget,
  type HeaderBag,
  type SharedBudgetOptions,
} from './budget.js';
import {
  coverageDays,
  preparePrematch,
  PREMATCH_REQUEST_BUDGET,
  readUpcomingPager,
  upcomingHasAnotherPage,
  type UpcomingPager,
} from './footballCoverage.js';
import { diagnoseOddsPayload, marketsFromOddsPayload, normalizeFootballDetails, normalizeFootballList, type OddsDiagnosis } from './parse.js';
import {
  bet365Directory,
  findBet365Link,
  normalizeBet365Live,
  normalizeBet365Prematch,
  type Bet365EventMarkets,
  type Bet365EventLink,
} from './bet365Markets.js';
import {
  FOOTBALL_SPORT_ID,
  type FeedEndpoint,
  type FeedResult,
  type NormalizedEvent,
  type NormalizedFeed,
  type NormalizedMarket,
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
  pager?: UpcomingPager | null;
  sportId?: EventsSportId;
}

export type EventOddsState = OddsDiagnosis | 'rate_limited' | 'stale' | 'upstream';

export interface EventOddsRead {
  eventId: string;
  priceState: EventOddsState;
  markets: NormalizedMarket[];
  stale: boolean;
}

interface OddsCacheEntry {
  storedAt: number;
  priceState: OddsDiagnosis;
  markets: NormalizedMarket[];
}

export interface BetsApiReadOnlyClientOptions extends SharedBudgetOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  freshMs?: Partial<Record<CacheKind, number>>;
  staleMs?: Partial<Record<CacheKind, number>>;
  hosts?: readonly string[];
  budget?: SharedRequestBudget;
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
  private additionalCursor = 0;
  private additionalRead: Promise<void> | null = null;
  private additionalReadAt = 0;
  private readonly additionalPages = new Map<string, { at: number; feed: FeedResult }>();
  private readonly inflight = new Map<string, Promise<FeedResult>>();
  private readonly oddsCache = new Map<string, OddsCacheEntry>();
  private readonly oddsInflight = new Map<string, Promise<EventOddsRead>>();
  private readonly bet365DirectoryCache = new Map<'live' | 'prematch', { at: number; links: Bet365EventLink[] }>();

  constructor(options: BetsApiReadOnlyClientOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.hosts = options.hosts ?? [BETSAPI_PRIMARY_HOST, BETSAPI_FALLBACK_HOST];
    this.now = options.now ?? (() => Date.now());
    this.budget = options.budget ?? new SharedRequestBudget({
      now: this.now,
      sleep: options.sleep,
      minGapMs: options.minGapMs,
    });
    this.freshMs = { ...FRESH_MS, ...options.freshMs };
    this.staleMs = { ...STALE_MS, ...options.staleMs };
  }

  additionalSportIds(): EventsSportId[] {
    return configuredAdditionalSports(this.env.BETSAPI_MULTISPORT_SPORT_IDS ?? '');
  }

  /** At most one additional phase read per interval, on the existing account budget. */
  async getAdditionalSports() {
    const tasks = this.additionalSportIds().flatMap((sportId) => [false, true].map((prematch) => ({ sportId, prematch })));
    if (tasks.length && !this.additionalRead && !this.budget.coolingDown() &&
        (!this.additionalReadAt || this.now() - this.additionalReadAt >= 15_000)) {
      const { sportId, prematch } = tasks[this.additionalCursor++ % tasks.length];
      this.additionalReadAt = this.now();
      this.additionalRead = (async () => {
        const feed = await (prematch ? this.getUpcoming(1, undefined, sportId) : this.getInplay(sportId));
        this.additionalPages.set(`${sportId}:${prematch}`, { at: this.now(), feed });
      })().finally(() => { this.additionalRead = null; });
    }
    await this.additionalRead;
    return tasks.map(({ sportId, prematch }) => {
      const snapshot = this.additionalPages.get(`${sportId}:${prematch}`);
      const usable = snapshot && this.now() - snapshot.at <= (prematch ? 600_000 : 90_000);
      return { sportId, prematch, result: usable ? snapshot.feed : null };
    });
  }

  getInplay(sportId: EventsSportId = FOOTBALL_SPORT_ID): Promise<FeedResult> {
    return this.cached('inplay', PATHS.inplay, { sport_id: sportId }, (json) => (
      normalizeFootballList(json, 'inplay', this.now(), sportId)
    ));
  }

  getUpcoming(page = 1, filters?: { day?: string; skipEsports?: boolean }, sportId: EventsSportId = FOOTBALL_SPORT_ID): Promise<FeedResult> {
    const safePage = Number.isInteger(page) && page >= 1 && page <= 5 ? page : 1;
    const query: Record<string, string> = { sport_id: sportId, page: String(safePage) };
    if (filters?.skipEsports) query.skip_esports = '1';
    if (filters?.day && /^\d{8}$/.test(filters.day)) query.day = filters.day;
    return this.cached('upcoming', PATHS.upcoming, query, (json) => (
      normalizeFootballList(json, 'upcoming', this.now(), sportId)
    ));
  }

  async getPrematchCoverage(): Promise<FeedResult> {
    const collected: NormalizedEvent[] = [];
    const jobs: Array<{ page: number; day?: string }> = [
      ...coverageDays(this.now()).map((day) => ({ page: 1, day })),
      { page: 1 },
    ];
    const overflow: Array<{ page: number; day?: string }> = [];
    let requests = 0;
    let rateLimited = false;
    let stale = false;
    let sawFeed = false;
    let tokenMissing = false;
    while ((jobs.length > 0 || overflow.length > 0) && requests < PREMATCH_REQUEST_BUDGET) {
      if (requests > 0 && this.budget.coolingDown()) {
        rateLimited = true;
        break;
      }
      const job = (jobs.shift() ?? overflow.shift())!;
      requests += 1;
      const result = await this.getUpcoming(job.page, { day: job.day, skipEsports: true });
      if (result.error === 'TOKEN_MISSING') {
        tokenMissing = true;
        break;
      }
      if (result.error === 'RATE_LIMITED' || result.feed?.rateLimited) {
        rateLimited = true;
        if (result.feed?.events.length) collected.push(...result.feed.events);
        break;
      }
      if (!result.ok || !result.feed) continue;
      sawFeed = true;
      stale = stale || result.feed.stale;
      collected.push(...result.feed.events);
      const query: Record<string, string> = { sport_id: FOOTBALL_SPORT_ID, page: String(job.page), skip_esports: '1' };
      if (job.day) query.day = job.day;
      const pager = this.cache.get(`upcoming:${new URLSearchParams(query).toString()}`)?.pager ?? null;
      if (job.page === 1 && upcomingHasAnotherPage(pager, result.feed.events.length)) {
        overflow.push({ page: 2, day: job.day });
      }
    }
    const events = preparePrematch(collected);
    if (tokenMissing) {
      return { ok: false, error: 'TOKEN_MISSING', upstreamStatus: null, feed: null };
    }
    if (!sawFeed && events.length === 0) {
      return { ok: false, error: rateLimited ? 'RATE_LIMITED' : 'UPSTREAM', upstreamStatus: null, feed: null };
    }
    const at = new Date(this.now()).toISOString();
    return {
      ok: true,
      error: null,
      upstreamStatus: 200,
      feed: {
        source: 'betsapi',
        mode: 'read-only',
        betting: 'disabled',
        settlement: 'disabled',
        endpoint: 'upcoming',
        sportId: FOOTBALL_SPORT_ID,
        fetchedAt: at,
        updatedAt: at,
        stale,
        rateLimited,
        rateLimit: null,
        events,
      },
    };
  }

  async getOddsPayload(eventId: string): Promise<unknown | null> {
    if (!/^\d{1,20}$/.test(eventId)) return null;
    const token = tokenFrom(this.env);
    if (!token) return null;
    const odds = await this.fetchAllowlisted(PATHS.odds, { event_id: eventId }, token);
    if (odds.status === 429) {
      this.budget.noteRateLimit(readRateLimitHeaders(odds.headers, this.now()));
      return null;
    }
    if (odds.timedOut || odds.networkError || odds.status < 200 || odds.status >= 300 || !accepted(odds.json)) {
      return null;
    }
    const observation = readRateLimitHeaders(odds.headers, this.now());
    this.budget.noteQuota(observation);
    return odds.json;
  }

  async readBet365Expanded(eventsId: string, live: boolean): Promise<{
    mapped: boolean;
    stale: boolean;
    rateLimited: boolean;
    link: Bet365EventLink | null;
    markets: Bet365EventMarkets | null;
  }> {
    const empty = { mapped: false, stale: false, rateLimited: false, link: null, markets: null };
    if (!/^\d{1,20}$/.test(eventsId) || eventsId === '0') return empty;
    if (this.budget.coolingDown()) return { ...empty, rateLimited: true };
    const phase = live ? 'live' : 'prematch';
    const directory = await this.bet365Links(phase);
    if (directory.rateLimited) return { ...empty, rateLimited: true };
    const link = findBet365Link(directory.links, eventsId, phase);
    if (!link) return empty;
    const detail = await this.fetchBet365(phase === 'live' ? '/v1/bet365/event' : '/v4/bet365/prematch', { FI: link.fi });
    if (detail.rateLimited) return { mapped: true, stale: false, rateLimited: true, link, markets: null };
    const markets = phase === 'live' ? normalizeBet365Live(detail.json, this.now()) : normalizeBet365Prematch(detail.json, this.now());
    if (!markets || markets.fi !== link.fi) return { mapped: true, stale: false, rateLimited: false, link, markets: null };
    if (markets.eventsId && markets.eventsId !== link.eventsId) return { mapped: true, stale: false, rateLimited: false, link, markets: null };
    return { mapped: true, stale: markets.stale, rateLimited: false, link, markets: { ...markets, eventsId: link.eventsId } };
  }

  private async bet365Links(phase: 'live' | 'prematch'): Promise<{ links: Bet365EventLink[]; rateLimited: boolean }> {
    const cached = this.bet365DirectoryCache.get(phase);
    if (cached && this.now() - cached.at <= 60_000) return { links: cached.links, rateLimited: false };
    const path = phase === 'live' ? '/v1/bet365/inplay_filter' : '/v1/bet365/upcoming';
    const query: Record<string, string> = { sport_id: '1' };
    if (phase === 'prematch') query.page = '1';
    const read = await this.fetchBet365(path, query);
    if (read.rateLimited) return { links: cached?.links ?? [], rateLimited: true };
    const links = bet365Directory(read.json, phase);
    this.bet365DirectoryCache.set(phase, { at: this.now(), links });
    return { links, rateLimited: false };
  }

  private async fetchBet365(path: string, query: Record<string, string>): Promise<{ json: unknown; rateLimited: boolean }> {
    const token = tokenFrom(this.env);
    if (!token) return { json: null, rateLimited: false };
    const upstream = await this.fetchAllowlisted(path, query, token);
    if (upstream.status === 429) {
      this.budget.noteRateLimit(readRateLimitHeaders(upstream.headers, this.now()));
      return { json: null, rateLimited: true };
    }
    if (upstream.timedOut || upstream.networkError || upstream.status < 200 || upstream.status >= 300 || !accepted(upstream.json)) {
      return { json: null, rateLimited: false };
    }
    this.budget.noteQuota(readRateLimitHeaders(upstream.headers, this.now()));
    return { json: upstream.json, rateLimited: false };
  }

  readEventOdds(eventId: string): Promise<EventOddsRead> {
    if (!/^\d{1,20}$/.test(eventId)) {
      return Promise.resolve({ eventId, priceState: 'unavailable', markets: [], stale: false });
    }
    const pending = this.oddsInflight.get(eventId);
    if (pending) return pending;
    const run = this.loadEventOdds(eventId).finally(() => {
      this.oddsInflight.delete(eventId);
    });
    this.oddsInflight.set(eventId, run);
    return run;
  }

  private async loadEventOdds(eventId: string): Promise<EventOddsRead> {
    const cached = this.oddsCache.get(eventId) ?? null;
    const age = cached ? this.now() - cached.storedAt : Number.POSITIVE_INFINITY;
    if (cached && age <= this.freshMs.odds) {
      return { eventId, priceState: cached.priceState, markets: cached.markets, stale: false };
    }
    const staleRead = (): EventOddsRead | null => (
      cached && age <= this.staleMs.odds
        ? { eventId, priceState: 'stale', markets: cached.markets, stale: true }
        : null
    );
    if (this.budget.coolingDown()) {
      return staleRead() ?? { eventId, priceState: 'rate_limited', markets: [], stale: false };
    }
    const token = tokenFrom(this.env);
    if (!token) return { eventId, priceState: 'upstream', markets: [], stale: false };
    const odds = await this.fetchAllowlisted(PATHS.odds, { event_id: eventId }, token);
    if (odds.status === 429) {
      this.budget.noteRateLimit(readRateLimitHeaders(odds.headers, this.now()));
      return staleRead() ?? { eventId, priceState: 'rate_limited', markets: [], stale: false };
    }
    if (odds.timedOut || odds.networkError || odds.status < 200 || odds.status >= 300 || !accepted(odds.json)) {
      return staleRead() ?? { eventId, priceState: 'upstream', markets: [], stale: false };
    }
    const observation = readRateLimitHeaders(odds.headers, this.now());
    this.budget.noteQuota(observation);
    const markets = marketsFromOddsPayload(odds.json);
    const priceState = diagnoseOddsPayload(odds.json);
    this.oddsCache.set(eventId, { storedAt: this.now(), priceState, markets });
    return { eventId, priceState, markets, stale: false };
  }

  getEnded(day: string): Promise<FeedResult> {
    return this.cached('ended', PATHS.ended, { sport_id: FOOTBALL_SPORT_ID, day }, (json) => (
      normalizeFootballList(json, 'ended', this.now())
    ));
  }

  getEventResult(eventId: string): Promise<FeedResult> {
    if (!/^\d{1,20}$/.test(eventId)) {
      return Promise.resolve({ ok: false, error: 'UPSTREAM', upstreamStatus: null, feed: null });
    }
    return this.cached('event', PATHS.view, { event_id: eventId }, (json) => {
      const row = normalizeFootballDetails(json, null, this.now());
      return row ? [row] : [];
    });
  }

  getEvent(eventId: string, sportId: EventsSportId = FOOTBALL_SPORT_ID): Promise<FeedResult> {
    const key = `event:${sportId}:${eventId}`;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const run = this.loadEvent(eventId, sportId).finally(() => {
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
    this.budget.noteQuota(observation);
    const entry: CacheEntry = {
      storedAt: this.now(),
      events: parse(upstream.json),
      endpoint,
      rateLimit: snapshotOf(observation),
      pager: readUpcomingPager(upstream.json),
      sportId: query.sport_id as EventsSportId | undefined,
    };
    this.cache.set(key, entry);
    return this.ok(entry, false, false);
  }

  private async loadEvent(eventId: string, sportId: EventsSportId): Promise<FeedResult> {
    const viewKey = `event:${sportId}:${eventId}`;
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
    this.budget.noteQuota(viewObservation);

    const observed = normalizeFootballDetails(view.json, null, this.now(), sportId);
    if (sportId !== FOOTBALL_SPORT_ID && observed?.eventId !== eventId) {
      return this.ok({ storedAt: this.now(), events: [], endpoint: 'event', sportId, rateLimit: snapshotOf(viewObservation) }, false, false);
    }
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
      this.budget.noteQuota(observation);
      oddsPayload = odds.json;
      oddsRate = snapshotOf(observation);
    }
    const event = normalizeFootballDetails(view.json, oddsLimited ? null : oddsPayload, this.now(), sportId);
    const entry: CacheEntry = {
      storedAt: this.now(),
      events: event?.eventId === eventId ? [event] : [],
      endpoint: 'event',
      sportId,
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
      sportId: entry.sportId ?? FOOTBALL_SPORT_ID,
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
        redirect: 'error',
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
    const isolated = Boolean(options?.now || options?.sleep || options?.budget);
    shared = new BetsApiReadOnlyClient({
      ...options,
      minGapMs: options?.minGapMs ?? 12_000,
      budget: options?.budget ?? (isolated ? undefined : getAccountRequestBudget()),
    });
  }
  return shared;
}

export function resetSharedBetsApiClient(): void {
  shared = null;
}

const ACCOUNT_HOURLY_LIMIT = 1_800;
export const ODDS_REQUEST_GAP_MS = Math.ceil(3_600_000 / ACCOUNT_HOURLY_LIMIT) * 2;
let accountBudget: SharedRequestBudget | null = null;
let oddsClient: BetsApiReadOnlyClient | null = null;

export function getAccountRequestBudget(): SharedRequestBudget {
  if (!accountBudget) accountBudget = new SharedRequestBudget({ minGapMs: ODDS_REQUEST_GAP_MS });
  return accountBudget;
}

export function getFootballOddsClient(): BetsApiReadOnlyClient {
  if (!oddsClient) {
    oddsClient = new BetsApiReadOnlyClient({
      minGapMs: ODDS_REQUEST_GAP_MS,
      budget: getAccountRequestBudget(),
    });
  }
  return oddsClient;
}

export function resetFootballOddsClient(): void {
  oddsClient = null;
  accountBudget = null;
}

export { BACKOFF_START_MS };
