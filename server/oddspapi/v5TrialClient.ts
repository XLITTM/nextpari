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
  /** Provider Retry-After or retryAfterSec. Never includes response text. */
  retryAfterMs?: number | null;
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

function retryAfterMs(response: Response, body: string): number | null {
  const header = response.headers.get('retry-after') ?? '';
  const seconds = Number(header);
  if (header && Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  if (header) {
    const dated = Date.parse(header);
    if (Number.isFinite(dated)) return Math.max(0, dated - Date.now());
  }
  try {
    const parsed = JSON.parse(body) as { retryAfterSec?: unknown };
    if (typeof parsed.retryAfterSec === 'number' && Number.isFinite(parsed.retryAfterSec) && parsed.retryAfterSec >= 0) {
      return Math.round(parsed.retryAfterSec * 1000);
    }
  } catch {
    return null;
  }
  return null;
}

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

  private async get<T>(endpoint: string, query: Record<string, string>, limits?: { timeoutMs?: number; maxBytes?: number }): Promise<V5Result<T>> {
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
        signal: AbortSignal.timeout(limits?.timeoutMs ?? this.timeoutMs),
        cache: 'no-store',
      });
      if (!response.ok) {
        const errorText = response.status === 429 ? (await response.text()).slice(0, 400) : '';
        return {
          ok: false,
          status: response.status,
          error: response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM',
          data: null,
          retryAfterMs: response.status === 429 ? retryAfterMs(response, errorText) : null,
        };
      }
      const maxBytes = limits?.maxBytes ?? 2_000_000;
      if (Number(response.headers.get('content-length')) > maxBytes) {
        return { ok: false, status: response.status, error: 'INVALID_RESPONSE', data: null };
      }
      const body = await response.text();
      if (body.length > maxBytes) return { ok: false, status: response.status, error: 'INVALID_RESPONSE', data: null };
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
    return this.get('markets', { sportId: String(sportId) }, { timeoutMs: 20_000, maxBytes: 8_000_000 });
  }
  today(sportId: number): Promise<V5Result<JsonRecord[]>> {
    if (!validSportId(sportId)) return Promise.resolve({ ok: false, status: null, error: 'INVALID_RESPONSE', data: null });
    return this.get('fixtures/today', { sportId: String(sportId), bookmakers: V5_BOOKMAKER }, { timeoutMs: 20_000, maxBytes: 8_000_000 });
  }
  live(sportId: number): Promise<V5Result<JsonRecord[]>> {
    if (!validSportId(sportId)) return Promise.resolve({ ok: false, status: null, error: 'INVALID_RESPONSE', data: null });
    return this.get('fixtures/live', { sportId: String(sportId), bookmakers: V5_BOOKMAKER }, { timeoutMs: 20_000, maxBytes: 8_000_000 });
  }
  /**
   * Documented uncapped listing: GET /en/fixtures with startTimeFrom/startTimeTo (epoch seconds).
   * Does not invent dates. Callers must pass a bounded horizon.
   */
  fixtures(sportId: number, range: { startTimeFrom: number; startTimeTo: number; statusId?: number }): Promise<V5Result<JsonRecord[]>> {
    if (!validSportId(sportId)) return Promise.resolve({ ok: false, status: null, error: 'INVALID_RESPONSE', data: null });
    if (!Number.isSafeInteger(range.startTimeFrom) || !Number.isSafeInteger(range.startTimeTo) || range.startTimeTo < range.startTimeFrom) {
      return Promise.resolve({ ok: false, status: null, error: 'INVALID_RESPONSE', data: null });
    }
    const query: Record<string, string> = {
      sportId: String(sportId),
      bookmakers: V5_BOOKMAKER,
      startTimeFrom: String(range.startTimeFrom),
      startTimeTo: String(range.startTimeTo),
    };
    if (range.statusId !== undefined) query.statusId = String(range.statusId);
    return this.get('fixtures', query, { timeoutMs: 20_000, maxBytes: 8_000_000 });
  }
  fixtureOdds(id: string): Promise<V5Result<JsonRecord>> {
    if (!sourceFixtureId(id)) return Promise.resolve({ ok: false, status: null, error: 'INVALID_RESPONSE', data: null });
    return this.get('fixtures/odds', { fixtureId: id, bookmakers: V5_BOOKMAKER });
  }
  /** Documented main-line snapshot, capped at 100 fixture IDs by the provider. */
  mainOdds(ids: readonly string[]): Promise<V5Result<JsonRecord[]>> {
    const unique = [...new Set(ids.filter(sourceFixtureId))].slice(0, 100);
    if (unique.length === 0) return Promise.resolve({ ok: true, status: 200, error: null, data: [] });
    return this.get('fixtures/odds/main', {
      fixtureIds: unique.join(','),
      bookmakers: V5_BOOKMAKER,
    }, { timeoutMs: 20_000, maxBytes: 8_000_000 });
  }
  participants(ids: readonly number[]): Promise<V5Result<JsonRecord[]>> {
    const unique = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 40);
    if (unique.length === 0) return Promise.resolve({ ok: true, status: 200, error: null, data: [] });
    return this.get('participants', { participantIds: unique.join(',') });
  }
  tournaments(ids: readonly number[]): Promise<V5Result<JsonRecord[]>> {
    const unique = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 40);
    if (unique.length === 0) return Promise.resolve({ ok: true, status: 200, error: null, data: [] });
    return this.get('tournaments', { tournamentIds: unique.join(',') });
  }
}

const CATALOG_TTL_MS = 10 * 60 * 1000;
const catalogCache = new Map<string, { at: number; value: { name: string; sportId: number | null } | null }>();

export function clearV5CatalogCache(): void {
  catalogCache.clear();
}

function catalogRows(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter((item) => item !== null && typeof item === 'object') as JsonRecord[];
  const body = record(value);
  for (const key of ['participants', 'tournaments', 'data']) {
    if (Array.isArray(body[key])) return body[key].filter((item) => item !== null && typeof item === 'object') as JsonRecord[];
  }
  return [];
}

function rememberCatalog(kind: 'participant' | 'tournament', id: number, value: { name: string; sportId: number | null } | null, now: number): void {
  catalogCache.set(`${kind}:${id}`, { at: now, value });
}

async function resolveCatalog(
  kind: 'participant' | 'tournament',
  ids: readonly number[],
  load: (missing: number[]) => Promise<V5Result<JsonRecord[]>>,
  read: (row: JsonRecord) => { id: number; name: string; sportId: number | null } | null,
  now = Date.now(),
): Promise<Map<number, { name: string; sportId: number | null } | null>> {
  const out = new Map<number, { name: string; sportId: number | null } | null>();
  const missing: number[] = [];
  for (const id of [...new Set(ids)]) {
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const hit = catalogCache.get(`${kind}:${id}`);
    if (hit && now - hit.at < CATALOG_TTL_MS) out.set(id, hit.value);
    else missing.push(id);
  }
  for (let index = 0; index < missing.length; index += 40) {
    const chunk = missing.slice(index, index + 40);
    const result = await load(chunk);
    if (!result.ok || !result.data) continue;
    const found = new Map<number, { name: string; sportId: number | null } | null>();
    for (const row of catalogRows(result.data)) {
      const parsed = read(row);
      if (!parsed || !chunk.includes(parsed.id)) continue;
      const previous = found.get(parsed.id);
      if (previous && previous.name !== parsed.name) found.set(parsed.id, null);
      else if (!previous) found.set(parsed.id, { name: parsed.name, sportId: parsed.sportId });
    }
    for (const id of chunk) {
      const value = found.get(id) ?? null;
      rememberCatalog(kind, id, value, now);
      out.set(id, value);
    }
  }
  return out;
}

export async function cachedParticipants(
  reader: Pick<OddsPapiV5TrialReader, 'participants'>,
  ids: readonly number[],
  now = Date.now(),
): Promise<Map<number, { name: string; sportId: number | null } | null>> {
  return resolveCatalog('participant', ids, (missing) => reader.participants(missing), (row) => {
    const id = row.participantId;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || !name) return null;
    return { id, name, sportId: typeof row.sportId === 'number' ? row.sportId : null };
  }, now);
}

export async function cachedTournaments(
  reader: Pick<OddsPapiV5TrialReader, 'tournaments'>,
  ids: readonly number[],
  now = Date.now(),
): Promise<Map<number, { name: string; sportId: number | null } | null>> {
  return resolveCatalog('tournament', ids, (missing) => reader.tournaments(missing), (row) => {
    const id = row.tournamentId;
    const name = typeof row.tournamentName === 'string' ? row.tournamentName.trim() : '';
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || !name) return null;
    return { id, name, sportId: typeof row.sportId === 'number' ? row.sportId : null };
  }, now);
}
