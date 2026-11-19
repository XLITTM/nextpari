/**
 * OddsPapi V5 trial-only reader for NextPari.
 * DO NOT use this client for accepting or settling bets. It does no wallet writes.
 * Never reuse BetsAPI source IDs without an explicit verified canonical mapping.
 */
export const V5_HOST = 'https://v5.oddspapi.io';
export const V5_BOOKMAKER = '1xbet' as const;

/** These are OddsPapi sport IDs, NOT BetsAPI/Events sport IDs. */
export const V5_SPORT_IDS = {
  football: 10,
  basketball: 11,
  tennis: 12,
  hockey: 15,
  esportsDota: 16,
  esportsCounterStrike: 17,
  esportsLeagueOfLegends: 18,
  volleyball: 23,
  tableTennis: 25,
  esportsValorant: 61,
} as const;

export type V5SportId = (typeof V5_SPORT_IDS)[keyof typeof V5_SPORT_IDS];
export type V5ClientError = 'NOT_CONFIGURED' | 'RATE_LIMITED' | 'TIMEOUT' | 'UPSTREAM' | 'INVALID_RESPONSE';

export interface V5Result<T> {
  ok: boolean;
  status: number | null;
  error: V5ClientError | null;
  data: T | null;
}
export interface V5ActiveQuote {
  source: 'oddspapi-v5';
  sourceFixtureId: string;
  sourceSelectionId: string;
  bookmaker: '1xbet';
  marketId: number;
  outcomeId: number;
  price: number;
  changedAt: string | number;
}
export interface V5FixtureSummary {
  fixtureId: string;
  sportId: number | null;
  live: boolean;
  hasOdds: boolean;
  staleOdds: boolean;
  suspended: boolean;
}
export type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}
function sourceFixtureId(id: unknown): id is string {
  return typeof id === 'string' && /^id[0-9]{8,32}$/.test(id);
}
function validSportId(id: number): id is V5SportId {
  return Object.values(V5_SPORT_IDS).some((value) => value === id);
}

/** A listing can be shown, but never treated as a betting quote. */
export function summarizeV5Fixture(value: unknown): V5FixtureSummary | null {
  const fixture = record(value);
  if (!sourceFixtureId(fixture.fixtureId)) return null;
  const bookmaker = record(record(fixture.bookmakers)[V5_BOOKMAKER]);
  const status = record(fixture.status);
  return {
    fixtureId: fixture.fixtureId,
    sportId: typeof record(fixture.sport).sportId === 'number' ? record(fixture.sport).sportId as number : null,
    live: status.live === true,
    hasOdds: bookmaker.hasOdds === true,
    staleOdds: bookmaker.staleOdds !== false, // unknown => unsafe
    suspended: bookmaker.suspended !== false, // unknown => unsafe
  };
}

/**
 * Extract only explicitly ACTIVE quotes from a non-stale, non-suspended 1xBet fixture.
 * This does NOT authorize bet acceptance: the selected price must still be
 * revalidated server-side against a fresh quote before wallet debit.
 */
export function extractActiveV5Quotes(value: unknown): V5ActiveQuote[] {
  const fixture = record(value);
  if (!sourceFixtureId(fixture.fixtureId)) return [];
  const bookmaker = record(record(fixture.bookmakers)[V5_BOOKMAKER]);
  if (bookmaker.hasOdds !== true || bookmaker.staleOdds !== false || bookmaker.suspended !== false) return [];

  const allOdds = record(record(fixture.odds)[V5_BOOKMAKER]);
  const activeQuotes: V5ActiveQuote[] = [];
  for (const [sourceSelectionId, entry] of Object.entries(allOdds)) {
    const parts = sourceSelectionId.split(':');
    if (parts.length !== 4 || parts[0] !== fixture.fixtureId || parts[1] !== V5_BOOKMAKER) continue;
    const data = record(entry);
    if (data.active !== true || data.bookmaker !== V5_BOOKMAKER) continue;
    const price = data.price;
    const marketId = data.marketId;
    const outcomeId = data.outcomeId;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 1) continue;
    if (typeof marketId !== 'number' || !Number.isSafeInteger(marketId)) continue;
    if (typeof outcomeId !== 'number' || !Number.isSafeInteger(outcomeId)) continue;
    if (parts[2] !== String(outcomeId)) continue;
    if (typeof data.changedAt !== 'string' && typeof data.changedAt !== 'number') continue;
    activeQuotes.push({
      source: 'oddspapi-v5', sourceFixtureId: fixture.fixtureId, sourceSelectionId,
      bookmaker: V5_BOOKMAKER, marketId, outcomeId, price, changedAt: data.changedAt,
    });
  }
  return activeQuotes;
}

export interface V5ReaderOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Fixed-host and fixed-bookmaker server-side REST reader. Never expose its key
 * in frontend JS, error responses, URL logs, or source-control commits.
 */
export class OddsPapiV5TrialReader {
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: V5ReaderOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = Math.min(20_000, Math.max(1_000, options.timeoutMs ?? 9_000));
  }

  private async get<T>(endpoint: string, query: Record<string, string>): Promise<V5Result<T>> {
    const key = String(this.env.ODDSPAPI_V5_API_KEY ?? '').trim();
    if (!key) return { ok: false, status: null, error: 'NOT_CONFIGURED', data: null };
    if (!/^[a-z/]+$/.test(endpoint)) return { ok: false, status: null, error: 'INVALID_RESPONSE', data: null };
    const url = new URL('/en/' + endpoint, V5_HOST);
    url.searchParams.set('apiKey', key);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);

    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: 'no-store',
      });
      if (!response.ok) {
        return { ok: false, status: response.status, error: response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM', data: null };
      }
      if (Number(response.headers.get('content-length')) > 2_000_000) {
        return { ok: false, status: response.status, error: 'INVALID_RESPONSE', data: null };
      }
      const body = await response.text();
      if (body.length > 2_000_000) return { ok: false, status: response.status, error: 'INVALID_RESPONSE', data: null };
      let value: unknown;
      try { value = JSON.parse(body); }
      catch { return { ok: false, status: response.status, error: 'INVALID_RESPONSE', data: null }; }
      if (value === null || typeof value !== 'object') {
        return { ok: false, status: response.status, error: 'INVALID_RESPONSE', data: null };
      }
      return { ok: true, status: response.status, error: null, data: value as T };
    } catch (error) {
      const timedOut = error instanceof Error && /timeout|abort/i.test(error.name);
      return { ok: false, status: null, error: timedOut ? 'TIMEOUT' : 'UPSTREAM', data: null };
    }
  }

  sports(): Promise<V5Result<JsonRecord[]>> { return this.get('sports', {}); }
  markets(sportId: number): Promise<V5Result<JsonRecord[]>> {
    if (!validSportId(sportId)) return Promise.resolve({ ok: false, status: null, error: 'INVALID_RESPONSE', data: null });
    return this.get('markets', { sportId: String(sportId) });
  }
  today(sportId: number): Promise<V5Result<JsonRecord[]>> {
    if (!validSportId(sportId)) return Promise.resolve({ ok: false, status: null, error: 'INVALID_RESPONSE', data: null });
    return this.get('fixtures/today', { sportId: String(sportId), bookmakers: V5_BOOKMAKER });
  }
  live(sportId: number): Promise<V5Result<JsonRecord[]>> {
    if (!validSportId(sportId)) return Promise.resolve({ ok: false, status: null, error: 'INVALID_RESPONSE', data: null });
    return this.get('fixtures/live', { sportId: String(sportId), bookmakers: V5_BOOKMAKER });
  }
  fixtureOdds(id: string): Promise<V5Result<JsonRecord>> {
    if (!sourceFixtureId(id)) return Promise.resolve({ ok: false, status: null, error: 'INVALID_RESPONSE', data: null });
    return this.get('fixtures/odds', { fixtureId: id, bookmakers: V5_BOOKMAKER });
  }
}
