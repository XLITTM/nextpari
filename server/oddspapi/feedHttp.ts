import type { FootballFeedCard, FootballFeedMarket } from '../betsapi/footballFeedHttp.js';
import type { MarketCategory, MarketGroup } from '../../src/types.js';
import {
  indexV5Markets,
  pickPrimaryMainMarket,
  presentV5Quotes,
  unixSecondsToMs,
  type V5MarketDefinition,
} from './canonical.js';
import { competitionRank, takeDiverse } from '../../src/lib/competitionCatalog.js';
import { isLadderType, marketTypeOf, outcomeLabelFor, subtypeLabel } from '../../src/lib/marketTaxonomy.js';
import { clearV5RequestSchedule, scheduledRead, V5_DOCUMENTED_LIMITS, V5_REQUEST_GAPS } from './requestSchedule.js';
import { OddsPapiV5TrialReader, V5_SPORT_IDS, type JsonRecord, type V5Result } from './v5TrialClient.js';

export const V5_EVENT_PREFIX = 'oddspapi-v5:';
export const PREMATCH_HORIZON_DAYS_DEFAULT = 7;
export const FEATURED_LIVE_LIMIT = 8;
export const FEATURED_LINE_LIMIT = 8;
export const MAIN_ODDS_CHUNK = 100;
export const CLIENT_ODDS_BATCH = 40;

type Card = FootballFeedCard & {
  provider: 'oddspapi-v5';
  displayGroups: MarketGroup[];
  observedAt: string;
  priceAudit: { rawBookmakerPrices: number; acceptedQuotes: number; displayedPrices: number; rejectedQuotes: number; rejectionReasons: Record<string, number> };
};

const SPORTS: Record<number, Card['sport']> = {
  10: 'football', 11: 'basketball', 12: 'tennis', 15: 'hockey',
  16: 'esports', 17: 'esports', 18: 'esports', 23: 'volleyball', 25: 'table-tennis', 61: 'esports',
};
const DISCIPLINE: Record<number, string> = { 16: 'Dota 2', 17: 'CS 2', 18: 'League of Legends', 61: 'Valorant' };
const FIXTURE_ID = /^id\d{8,32}$/;

export type CatalogDropReason =
  | 'duplicate'
  | 'unsupported-sport'
  | 'missing-identity'
  | 'finished'
  | 'cancelled'
  | 'removed'
  | 'outside-horizon'
  | 'normalization';

export interface CatalogPipeline {
  raw: number;
  selected: number;
  normalized: number;
  priced: number;
  dropped: Partial<Record<CatalogDropReason, number>>;
}

export function clearV5FeedCache(): void { clearV5RequestSchedule(); }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function rows(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(record);
  const body = record(value);
  if (Array.isArray(body.data)) return body.data.map(record);
  if (Array.isArray(body.fixtures)) return body.fixtures.map(record);
  return [];
}
function name(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function sourceId(id: string): string | null { return /^oddspapi-v5:id\d{8,32}$/.test(id) ? id.slice(V5_EVENT_PREFIX.length) : null; }
function fixtureIdOf(f: JsonRecord): string { return name(f.fixtureId); }
function sportIdOf(f: JsonRecord): number | null {
  const sportId = record(f.sport).sportId;
  return typeof sportId === 'number' && SPORTS[sportId] ? sportId : null;
}
function statusIdOf(f: JsonRecord): number | null {
  const statusId = record(f.status).statusId;
  return typeof statusId === 'number' ? statusId : null;
}
function keepMsFor(key: string): number {
  if (key.startsWith('odds:')) return 10 * 60_000;
  if (key.startsWith('live:') || key.startsWith('range:')) return 15 * 60_000;
  if (key.startsWith('markets:')) return 6 * 60 * 60_000;
  return 30 * 60_000;
}
async function cached<T>(key: string, freshMs: number, load: () => Promise<V5Result<T>>) {
  return scheduledRead(key, freshMs, keepMsFor(key), load);
}
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = index++;
      if (i >= items.length) return;
      output[i] = await fn(items[i]);
    }
  }));
  return output;
}

export function prematchHorizonDays(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.ODDSPAPI_V5_PREMATCH_DAYS);
  if (!Number.isFinite(parsed)) return PREMATCH_HORIZON_DAYS_DEFAULT;
  return Math.min(PREMATCH_HORIZON_DAYS_DEFAULT, Math.max(1, Math.floor(parsed)));
}

export function v5MarketFamily(m: V5MarketDefinition): string {
  return marketTypeOf(m);
}
function groupCategory(m: V5MarketDefinition): MarketCategory {
  const type = marketTypeOf(m);
  if (type.startsWith('players-') || type.startsWith('playertotals-')) return 'players';
  if (type.endsWith('-corners') || type.includes('-corners-')) return 'corners';
  if (type.endsWith('-bookings') || type.includes('-cards')) return 'cards';
  if (m.period === 'p1') return '1st-half';
  if (m.period === 'p2') return '2nd-half';
  if (isLadderType(type) && !type.startsWith('spreads')) return 'totals';
  if (type.startsWith('spreads')) return 'handicaps';
  return 'main';
}
function displayMarketName(m: V5MarketDefinition): string {
  const type = marketTypeOf(m);
  const base = subtypeLabel({ marketType: type, marketName: m.marketName, period: m.period, handicap: m.handicap });
  const line = isLadderType(type) && m.handicap !== null ? String(m.handicap) : '';
  return [base, line].filter(Boolean).join(' · ');
}

function bump(dropped: CatalogPipeline['dropped'], reason: CatalogDropReason): void {
  dropped[reason] = (dropped[reason] ?? 0) + 1;
}

export function v5FixtureToCard(
  f: JsonRecord,
  catalog: ReturnType<typeof indexV5Markets> | null,
  now = Date.now(),
  options?: { snapshotStale?: boolean; listCard?: boolean },
): Card | null {
  const id = fixtureIdOf(f);
  const sportId = sportIdOf(f);
  if (!FIXTURE_ID.test(id) || sportId === null) return null;
  const participants = record(f.participants);
  const tournament = record(f.tournament);
  const status = record(f.status);
  const home = name(participants.participant1Name);
  const away = name(participants.participant2Name);
  const bookmaker = record(record(f.bookmakers)['1xbet']);
  const safe = bookmaker.hasOdds === true && bookmaker.staleOdds === false && bookmaker.suspended === false && bookmaker.participantsRotated === false;
  const rawBookmakerPrices = Object.keys(record(record(f.odds)['1xbet'])).length;
  const presentation = safe && catalog
    ? presentV5Quotes(f, catalog, now, { freshReadOnlySnapshot: true })
    : { accepted: [], rejected: 0, reasons: rawBookmakerPrices ? { [safe ? 'market-catalog-unavailable' : 'bookmaker-unsafe']: rawBookmakerPrices } : {} };
  const quotes = presentation.accepted;
  const groups = new Map<number, MarketGroup>();
  for (const quote of quotes) {
    const market = catalog!.byId.get(quote.marketId)!;
    const group = groups.get(quote.marketId) || {
      id: `${V5_EVENT_PREFIX}${id}:market:${quote.marketId}`,
      name: displayMarketName(market),
      category: groupCategory(market),
      marketFamily: v5MarketFamily(market),
      outcomes: [],
      bookmakerId: '1xbet',
      externalPeriodId: market.period,
      externalMarketId: String(quote.marketId),
    };
    group.outcomes.push({
      label: outcomeLabelFor(marketTypeOf(market), quote.outcomeName),
      odds: quote.price,
      locked: true,
      sourceSelectionId: quote.sourceSelectionId,
      outcomeId: String(quote.outcomeId),
      updatedAt: new Date(now).toISOString(),
    });
    groups.set(quote.marketId, group);
  }
  const primary = catalog
    ? pickPrimaryMainMarket(sportId, [...groups.keys()].flatMap((marketId) => {
      const market = catalog.byId.get(marketId);
      return market ? [market] : [];
    }))
    : null;
  const main = primary ? groups.get(primary.marketId) ?? null : null;
  const outcomes = main?.outcomes.flatMap((o) => {
    const key = o.label === 'П1' ? 'home' : o.label === 'П2' ? 'away' : o.label === 'X' ? 'draw' : null;
    return key ? [{ key, name: o.label, price: o.odds, sourceSelectionId: o.sourceSelectionId }] : [];
  }) || [];
  const markets: FootballFeedMarket[] = outcomes.some((o) => o.key === 'home') && outcomes.some((o) => o.key === 'away')
    ? [{
      key: outcomes.some((o) => o.key === 'draw') ? '1x2' : 'moneyline',
      name: 'Исход',
      line: '',
      status: 'open',
      outcomes,
      updatedAt: new Date(now).toISOString(),
      bookmakerId: '1xbet',
      externalPeriodId: main!.externalPeriodId || null,
      externalMarketId: String(primary!.marketId),
    }]
    : [];
  const score = record(record(f.scores).result);
  const clock = record(f.clock);
  const at = Date.parse(name(clock.updatedAt));
  const time = /^(\d{1,3}):(\d{2})$/.exec(name(clock.currentTime));
  const live = status.live === true;
  const liveClock = live && sportId === 10 && time && Number(time[2]) < 60 && Number.isFinite(at)
    ? { minute: Number(time[1]), second: Number(time[2]), running: clock.stopped === false, observedAt: new Date(at).toISOString(), stale: now - at > 90_000 || at > now + 60_000 }
    : null;
  const kickoffMs = unixSecondsToMs(f.startTime);
  const displayGroups = options?.listCard
    ? (main ? [main] : [])
    : [...groups.values()].sort((a, b) => Number(a.externalMarketId) - Number(b.externalMarketId));
  const card: Card = {
    id: V5_EVENT_PREFIX + id,
    provider: 'oddspapi-v5',
    sport: SPORTS[sportId],
    tier: sportId === 10 ? 1 : 3,
    logos: { competitionId: null, competition: null, home: null, away: null },
    league: name(tournament.tournamentName),
    country: name(tournament.categoryName),
    discipline: DISCIPLINE[sportId] ?? null,
    home,
    away,
    kickoff: kickoffMs ? new Date(kickoffMs).toISOString() : null,
    live,
    score: typeof score.participant1Score === 'number' && typeof score.participant2Score === 'number'
      ? { home: score.participant1Score, away: score.participant2Score }
      : null,
    liveClock,
    period: sportId === 10 && clock.currentPeriod === 'p1' ? 'first_half' : sportId === 10 && clock.currentPeriod === 'p2' ? 'second_half' : null,
    priceState: bookmaker.suspended === true
      ? 'suspended'
      : bookmaker.staleOdds !== false
        ? 'stale'
        : groups.size
          ? 'open'
          : safe ? 'unpriced' : 'unavailable',
    markets,
    displayGroups,
    observedAt: new Date(now).toISOString(),
    priceAudit: {
      rawBookmakerPrices,
      acceptedQuotes: quotes.length,
      displayedPrices: displayGroups.reduce((sum, group) => sum + group.outcomes.length, 0),
      rejectedQuotes: presentation.rejected,
      rejectionReasons: presentation.reasons,
    },
  };
  if (options?.snapshotStale && card.priceState === 'open') card.priceState = 'stale';
  return card;
}

function mergeFixture(listing: JsonRecord, priced: JsonRecord | null): JsonRecord {
  if (!priced) return listing;
  return {
    ...listing,
    ...priced,
    participants: { ...record(listing.participants), ...record(priced.participants) },
    tournament: { ...record(listing.tournament), ...record(priced.tournament) },
    status: { ...record(listing.status), ...record(priced.status) },
    scores: Object.keys(record(priced.scores)).length ? priced.scores : listing.scores,
    clock: Object.keys(record(priced.clock)).length ? priced.clock : listing.clock,
    odds: priced.odds ?? listing.odds,
    bookmakers: priced.bookmakers ?? listing.bookmakers,
  };
}

function collectFixtures(
  sportId: number,
  liveRows: JsonRecord[],
  prematchRows: JsonRecord[],
  now: number,
  horizonMs: number,
  dropped: CatalogPipeline['dropped'],
): JsonRecord[] {
  const unique = new Map<string, JsonRecord>();
  const consider = (f: JsonRecord) => {
    const id = fixtureIdOf(f);
    if (!FIXTURE_ID.test(id)) {
      bump(dropped, 'missing-identity');
      return;
    }
    if (unique.has(id)) {
      bump(dropped, 'duplicate');
      return;
    }
    if (sportIdOf(f) !== sportId) {
      bump(dropped, 'unsupported-sport');
      return;
    }
    const statusId = statusIdOf(f);
    if (statusId === 2) {
      bump(dropped, 'finished');
      return;
    }
    if (statusId === 3) {
      bump(dropped, 'cancelled');
      return;
    }
    if (statusId === 4) {
      bump(dropped, 'removed');
      return;
    }
    const live = record(f.status).live === true;
    const kickoff = unixSecondsToMs(f.startTime);
    if (!live && kickoff !== null && kickoff > now + horizonMs) {
      bump(dropped, 'outside-horizon');
      return;
    }
    if (!live && kickoff !== null && kickoff <= now) {
      bump(dropped, 'outside-horizon');
      return;
    }
    unique.set(id, f);
  };
  for (const f of liveRows) consider(f);
  for (const f of prematchRows) consider(f);
  return [...unique.values()];
}

async function readPrematch(
  reader: OddsPapiV5TrialReader,
  sportId: number,
  from: number,
  to: number,
): Promise<V5Result<JsonRecord[]> & { snapshotStale?: boolean }> {
  if (typeof reader.fixtures === 'function') {
    const ranged = await cached(`range:${sportId}:${from}:${to}`, 180_000, () => reader.fixtures(sportId, {
      startTimeFrom: from,
      startTimeTo: to,
    }));
    if (ranged.ok && ranged.data) return ranged;
  }
  return cached(`today:${sportId}`, 180_000, () => reader.today(sportId));
}

async function hydrateMainOdds(
  reader: OddsPapiV5TrialReader,
  ids: string[],
): Promise<{ byId: Map<string, JsonRecord>; stale: boolean; rateLimited: boolean }> {
  const byId = new Map<string, JsonRecord>();
  let stale = false;
  let rateLimited = false;
  if (!ids.length) return { byId, stale, rateLimited };
  if (typeof reader.mainOdds !== 'function') return { byId, stale, rateLimited };
  for (let index = 0; index < ids.length; index += MAIN_ODDS_CHUNK) {
    const chunk = ids.slice(index, index + MAIN_ODDS_CHUNK);
    const key = `odds:main:${chunk.slice().sort().join(',')}`;
    const result = await cached(key, 15_000, () => reader.mainOdds(chunk));
    if (result.snapshotStale) stale = true;
    if (!result.ok && result.error === 'RATE_LIMITED') rateLimited = true;
    for (const row of rows(result.data)) {
      const id = fixtureIdOf(row);
      if (FIXTURE_ID.test(id)) byId.set(id, row);
    }
  }
  return { byId, stale, rateLimited };
}

function serverHydrationIds(fixtures: JsonRecord[]): string[] {
  const identity = (f: JsonRecord) => `${name(record(f.tournament).categoryName)}|${name(record(f.tournament).tournamentName)}`;
  const rank = (f: JsonRecord) => {
    const sportId = sportIdOf(f);
    return competitionRank(sportId ? SPORTS[sportId] ?? '' : '', name(record(f.tournament).tournamentName), name(record(f.tournament).categoryName));
  };
  const time = (f: JsonRecord) => Number(f.startTime) || 0;
  const live = fixtures.filter((f) => record(f.status).live === true).map(fixtureIdOf);
  const prematch = fixtures.filter((f) => record(f.status).live !== true);
  const featuredPrematch = takeDiverse(prematch, FEATURED_LINE_LIMIT, identity, rank, time).map(fixtureIdOf);
  return [...live, ...featuredPrematch];
}

export async function handleV5SportsFeed(
  input: { method?: string; url?: string },
  env: NodeJS.ProcessEnv = process.env,
  reader = new OddsPapiV5TrialReader({ env, timeoutMs: 6_000 }),
) {
  const base = { source: 'oddspapi-v5', betsAccepted: false, websocket: 'not-running' };
  if ((input.method || 'GET').toUpperCase() !== 'GET') {
    return { status: 405, body: { ...base, ok: false, error: 'METHOD_NOT_ALLOWED' } };
  }
  if (!String(env.ODDSPAPI_V5_API_KEY || '').trim()) {
    return { status: 503, body: { ...base, ok: false, error: 'NOT_CONFIGURED', events: [] } };
  }
  const params = new URL(input.url || '/', 'https://nextpari.net').searchParams;
  async function catalog(sportId: number) {
    const r = await cached(`markets:${sportId}`, 600_000, () => reader.markets(sportId));
    return r.ok ? indexV5Markets(r.data) : null;
  }
  async function detail(id: string) {
    const r = await cached(`odds:full:${id}`, 15_000, () => reader.fixtureOdds(id));
    if (!r.ok || !r.data) return { card: null, result: r };
    if (r.data.fixtureId !== id) return { card: null, result: r };
    const sportId = sportIdOf(r.data);
    const cat = sportId !== null ? await catalog(sportId) : null;
    return { card: v5FixtureToCard(r.data, cat, Date.now(), { snapshotStale: r.snapshotStale }), result: r };
  }
  if (params.has('eventId')) {
    const id = sourceId(params.get('eventId') || '');
    if (!id) return { status: 404, body: { ...base, ok: false, error: 'NOT_FOUND', events: [] } };
    const { card, result } = await detail(id);
    return { status: card ? 200 : result.ok ? 404 : 503, body: { ...base, ok: Boolean(card), error: result.error, events: card ? [card] : [] } };
  }
  if (params.has('oddsFor')) {
    const ids = [...new Set((params.get('oddsFor') || '').split(',').map((id) => sourceId(id)).filter((id): id is string => Boolean(id)))].slice(0, MAIN_ODDS_CHUNK);
    const hydrated = await hydrateMainOdds(reader, ids);
    const quotes = await mapLimit(ids, 4, async (id) => {
      const priced = hydrated.byId.get(id);
      if (!priced) {
        return { id: V5_EVENT_PREFIX + id, priceState: hydrated.rateLimited ? 'rate_limited' : 'upstream', stale: true, markets: [] };
      }
      const sportId = sportIdOf(priced);
      const cat = sportId !== null ? await catalog(sportId) : null;
      const card = v5FixtureToCard(priced, cat, Date.now(), { snapshotStale: hydrated.stale, listCard: true });
      return card
        ? { ...card, stale: card.priceState === 'stale' }
        : { id: V5_EVENT_PREFIX + id, priceState: 'upstream', stale: true, markets: [] };
    });
    return { status: 200, body: { ...base, ok: true, quotes } };
  }

  const sportIds = params.get('includeSports') === '1' ? Object.values(V5_SPORT_IDS) : [10];
  const horizonDays = prematchHorizonDays(env);
  const now = Date.now();
  const hour = 3600;
  const from = Math.floor(now / 1000 / hour) * hour;
  const to = from + horizonDays * 86400;
  const dropped: CatalogPipeline['dropped'] = {};
  let raw = 0;
  const listings = await mapLimit(sportIds, 1, async (sportId) => {
    const [live, prematch] = await Promise.all([
      cached(`live:${sportId}`, 45_000, () => reader.live(sportId)),
      readPrematch(reader, sportId, from, to),
    ]);
    const liveRows = rows(live.data);
    const prematchRows = rows(prematch.data);
    raw += liveRows.length + prematchRows.length;
    const fixtures = collectFixtures(sportId, liveRows, prematchRows, now, horizonDays * 86_400_000, dropped);
    const limited = (!live.ok && live.error === 'RATE_LIMITED')
      || (!prematch.ok && prematch.error === 'RATE_LIMITED')
      || live.snapshotStale
      || Boolean(prematch.snapshotStale);
    return {
      sportId,
      fixtures,
      ok: live.ok || prematch.ok,
      error: live.ok || prematch.ok ? null : live.error || prematch.error,
      stale: live.snapshotStale || Boolean(prematch.snapshotStale),
      rateLimited: limited,
    };
  });

  const selected = listings.flatMap((s) => s.fixtures);
  const hydrated = await hydrateMainOdds(reader, serverHydrationIds(selected));
  const catalogs = new Map<number, ReturnType<typeof indexV5Markets> | null>();
  for (const sportId of sportIds) {
    if (selected.some((f) => sportIdOf(f) === sportId && hydrated.byId.has(fixtureIdOf(f)))) {
      catalogs.set(sportId, await catalog(sportId));
    }
  }
  const events = selected.flatMap((listing) => {
    const id = fixtureIdOf(listing);
    const merged = mergeFixture(listing, hydrated.byId.get(id) ?? null);
    const sportId = sportIdOf(merged);
    const card = v5FixtureToCard(merged, sportId !== null ? catalogs.get(sportId) ?? null : null, now, {
      snapshotStale: hydrated.stale,
      listCard: true,
    });
    if (!card) {
      bump(dropped, 'normalization');
      return [];
    }
    return [card];
  }).sort((a, b) => Number(b.markets.length > 0) - Number(a.markets.length > 0) || a.tier - b.tier || Number(b.live) - Number(a.live));

  const anyOk = listings.some((s) => s.ok);
  const rankOf = (card: Card) => competitionRank(card.sport, card.league, card.country);
  const byRank = (a: Card, b: Card) => rankOf(a) - rankOf(b) || Date.parse(a.kickoff || '') - Date.parse(b.kickoff || '');
  const featuredLive = takeDiverse(
    events.filter((c) => c.live && rankOf(c) < 30),
    FEATURED_LIVE_LIMIT,
    (card) => `${card.country}|${card.league}`,
    rankOf,
    (card) => Date.parse(card.kickoff || '') || 0,
  );
  const featuredLine = takeDiverse(
    events.filter((c) => !c.live && rankOf(c) < 30),
    FEATURED_LINE_LIMIT,
    (card) => `${card.country}|${card.league}`,
    rankOf,
    (card) => Date.parse(card.kickoff || '') || 0,
  );
  const schedule = events.filter((c) => !c.live).sort((a, b) => Date.parse(a.kickoff || '') - Date.parse(b.kickoff || ''));
  const pipeline: CatalogPipeline = {
    raw,
    selected: selected.length,
    normalized: events.length,
    priced: events.filter((card) => card.markets.length > 0).length,
    dropped,
  };
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  const limitParam = Number(params.get('limit'));
  const pageSize = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(500, Math.floor(limitParam)) : events.length;
  const paged = events.slice(offset, offset + pageSize);
  return {
    status: anyOk ? 200 : 503,
    body: {
      ...base,
      ok: anyOk,
      error: anyOk ? null : listings[0]?.error ?? null,
      rateLimited: listings.some((s) => s.rateLimited) || hydrated.rateLimited,
      stale: listings.some((s) => s.stale) || hydrated.stale,
      providerLimits: V5_DOCUMENTED_LIMITS,
      requestGapMs: V5_REQUEST_GAPS,
      horizonDays,
      events: paged,
      featuredLive,
      featuredLine,
      schedule,
      total: events.length,
      offset,
      nextOffset: offset + paged.length < events.length ? offset + paged.length : null,
      pipeline,
      coverage: listings.map(({ sportId, ok, error, fixtures, stale, rateLimited }) => ({
        sportId, ok, error, stale, rateLimited, count: fixtures.length,
      })),
    },
  };
}
