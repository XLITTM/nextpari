/**
 * OddsPapi V5 identities stay in their own namespace.
 * Names are display labels. They never decide whether two events are the same.
 */
import { extractActiveV5Quotes, summarizeV5Fixture, V5_SPORT_IDS, type V5ActiveQuote, type V5SportId } from './v5TrialClient.js';

export const ODDSPAPI_V5_NAMESPACE = 'oddspapi-v5';

const SPORT_KEYS: Record<V5SportId, string> = {
  [V5_SPORT_IDS.football]: 'football',
  [V5_SPORT_IDS.basketball]: 'basketball',
  [V5_SPORT_IDS.tennis]: 'tennis',
  [V5_SPORT_IDS.hockey]: 'ice-hockey',
  [V5_SPORT_IDS.esportsDota]: 'esports-dota',
  [V5_SPORT_IDS.esportsCounterStrike]: 'esports-counter-strike',
  [V5_SPORT_IDS.esportsLeagueOfLegends]: 'esports-league-of-legends',
  [V5_SPORT_IDS.volleyball]: 'volleyball',
  [V5_SPORT_IDS.tableTennis]: 'table-tennis',
  [V5_SPORT_IDS.esportsValorant]: 'esports-valorant',
};

const ORIENTED = /^(1|2|x|home|away|over|under|yes|no|odd|even|draw)$/i;
const LIVE_FRESH_MS = 180_000;
const PREMATCH_FRESH_MS = 6 * 60 * 60 * 1000;

export interface V5MarketDefinition {
  marketId: number;
  marketName: string;
  marketType: string;
  period: string;
  handicap: number | null;
  outcomes: Map<number, string>;
}

export interface V5CanonicalQuote extends V5ActiveQuote {
  canonicalEventId: string;
  canonicalMarketId: string;
  canonicalSelectionId: string;
  canonicalSportId: string;
  sportKey: string | null;
  marketName: string;
  marketType: string;
  outcomeName: string;
  period: string;
  handicap: number | null;
  line: string;
}

export const DEMO_FIXTURE_LIMIT = 40;
export const DEMO_CARD_PRICE_LIMIT = 12;

export interface V5FixtureDisplay {
  fixtureId: string;
  canonicalEventId: string;
  sportId: number | null;
  canonicalSportId: string | null;
  sportKey: string | null;
  live: boolean;
  hasOdds: boolean;
  staleOdds: boolean;
  suspended: boolean;
  participant1Id: number | null;
  participant2Id: number | null;
  participant1Name: string | null;
  participant2Name: string | null;
  tournamentId: number | null;
  tournamentName: string | null;
  startTimeMs: number | null;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isV5SportId(id: number): id is V5SportId {
  return Object.prototype.hasOwnProperty.call(SPORT_KEYS, id);
}

export function canonicalSportId(sportId: number): string {
  return `${ODDSPAPI_V5_NAMESPACE}:sport:${sportId}`;
}

export function sportKeyFor(sportId: number): string | null {
  return isV5SportId(sportId) ? SPORT_KEYS[sportId] : null;
}

export function canonicalEventId(fixtureId: string): string {
  return `${ODDSPAPI_V5_NAMESPACE}:event:${fixtureId}`;
}

export function canonicalMarketId(fixtureId: string, marketId: number): string {
  return `${ODDSPAPI_V5_NAMESPACE}:market:${fixtureId}:${marketId}`;
}

export function canonicalSelectionId(sourceSelectionId: string): string {
  return `${ODDSPAPI_V5_NAMESPACE}:selection:${sourceSelectionId}`;
}

export function sevenSportCategories(): Array<{ sportId: V5SportId; sportKey: string; canonicalSportId: string }> {
  return (Object.values(V5_SPORT_IDS) as V5SportId[]).map((sportId) => ({
    sportId,
    sportKey: SPORT_KEYS[sportId],
    canonicalSportId: canonicalSportId(sportId),
  }));
}

function outcomeRows(value: unknown): Array<{ outcomeId: number; outcomeName: string }> {
  if (!Array.isArray(value)) return [];
  const rows = [];
  for (const item of value) {
    const outcome = record(item);
    const outcomeId = outcome.outcomeId;
    const outcomeName = text(outcome.outcomeName);
    if (typeof outcomeId === 'number' && Number.isSafeInteger(outcomeId) && outcomeName) {
      rows.push({ outcomeId, outcomeName });
    }
  }
  return rows;
}

function marketRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const body = record(value);
  if (Array.isArray(body.markets)) return body.markets;
  if (Array.isArray(body.data)) return body.data;
  return [];
}

export function indexV5Markets(value: unknown): { byId: Map<number, V5MarketDefinition>; ambiguous: Set<number> } {
  const byId = new Map<number, V5MarketDefinition>();
  const ambiguous = new Set<number>();
  for (const item of marketRows(value)) {
    const market = record(item);
    const marketId = market.marketId;
    if (typeof marketId !== 'number' || !Number.isSafeInteger(marketId)) continue;
    const outcomes = new Map<number, string>();
    for (const outcome of outcomeRows(market.outcomes)) {
      const previous = outcomes.get(outcome.outcomeId);
      if (previous && previous.toLowerCase() !== outcome.outcomeName.toLowerCase()) {
        ambiguous.add(marketId);
      }
      outcomes.set(outcome.outcomeId, outcome.outcomeName);
    }
    const next: V5MarketDefinition = {
      marketId,
      marketName: text(market.marketName),
      marketType: text(market.marketType).toLowerCase(),
      period: text(market.period),
      handicap: typeof market.handicap === 'number' && Number.isFinite(market.handicap) ? market.handicap : null,
      outcomes,
    };
    const existing = byId.get(marketId);
    if (existing && (existing.marketName !== next.marketName || existing.marketType !== next.marketType || existing.period !== next.period)) {
      ambiguous.add(marketId);
    }
    byId.set(marketId, next);
  }
  return { byId, ambiguous };
}

function changedAtMs(value: string | number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? (value < 10_000_000_000 ? value * 1000 : value) : null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function needsOrientation(market: V5MarketDefinition): boolean {
  return /handicap|spread|total|1x2|moneyline/.test(market.marketType);
}

export function presentV5Quotes(
  fixture: unknown,
  catalog: { byId: Map<number, V5MarketDefinition>; ambiguous: Set<number> },
  now = Date.now(),
  options: { freshReadOnlySnapshot?: boolean } = {},
): { accepted: V5CanonicalQuote[]; rejected: number; reasons: Record<string, number> } {
  const summary = summarizeV5Fixture(fixture);
  const active = extractActiveV5Quotes(fixture);
  const reasons: Record<string, number> = {};
  const bump = (reason: string) => { reasons[reason] = (reasons[reason] ?? 0) + 1; };
  if (!summary) {
    if (active.length) reasons['fixture-summary'] = active.length;
    return { accepted: [], rejected: active.length, reasons };
  }
  const accepted: V5CanonicalQuote[] = [];
  let rejected = 0;
  const seenNames = new Map<number, Set<string>>();
  for (const quote of active) {
    const market = catalog.byId.get(quote.marketId);
    const outcomeName = market?.outcomes.get(quote.outcomeId) ?? '';
    const at = changedAtMs(quote.changedAt);
    const freshFor = summary.live ? LIVE_FRESH_MS : PREMATCH_FRESH_MS;
    const names = seenNames.get(quote.marketId) ?? new Set<string>();
    const playerId = quote.sourceSelectionId.split(':')[3] ?? '0';
    const duplicateSide = playerId === '0' && outcomeName !== '' && names.has(outcomeName.toLowerCase());
    const oriented = !market || !needsOrientation(market) || ORIENTED.test(outcomeName.trim());
    const fresh = at !== null && (now - at <= freshFor || options.freshReadOnlySnapshot === true) && now - at >= -60_000;
    let reason = '';
    if (!market) reason = 'no-market';
    else if (catalog.ambiguous.has(quote.marketId)) reason = 'ambiguous-market';
    else if (!outcomeName) reason = 'unnamed-outcome';
    else if (!oriented) reason = 'unoriented-outcome';
    else if (duplicateSide) reason = 'duplicate-outcome-name';
    else if (!fresh) reason = 'outside-freshness-window';
    if (reason || !market) {
      rejected += 1;
      bump(reason || 'no-market');
      continue;
    }
    names.add(outcomeName.toLowerCase());
    seenNames.set(quote.marketId, names);
    const sportId = summary.sportId;
    accepted.push({
      ...quote,
      canonicalEventId: canonicalEventId(summary.fixtureId),
      canonicalMarketId: canonicalMarketId(summary.fixtureId, quote.marketId),
      canonicalSelectionId: canonicalSelectionId(quote.sourceSelectionId),
      canonicalSportId: sportId === null ? `${ODDSPAPI_V5_NAMESPACE}:sport:unknown` : canonicalSportId(sportId),
      sportKey: sportId === null ? null : sportKeyFor(sportId),
      marketName: market.marketName,
      marketType: market.marketType,
      outcomeName,
      period: market.period,
      handicap: market.handicap,
      line: quote.sourceSelectionId.split(':')[3] ?? '',
    });
  }
  return { accepted, rejected, reasons };
}

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** OddsPapi V5 startTime is Unix seconds. Anything else stays unknown. */
export function unixSecondsToMs(value: unknown): number | null {
  const seconds = typeof value === 'number' ? value : typeof value === 'string' && /^\d{10}$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds < 1_000_000_000 || seconds > 10_000_000_000) return null;
  return seconds * 1000;
}

export function fixtureDisplay(value: unknown): V5FixtureDisplay | null {
  const summary = summarizeV5Fixture(value);
  if (!summary) return null;
  const fixture = record(value);
  const participants = record(fixture.participants);
  const tournament = record(fixture.tournament);
  const tournamentId = positiveInt(tournament.tournamentId);
  return {
    ...summary,
    canonicalEventId: canonicalEventId(summary.fixtureId),
    canonicalSportId: summary.sportId === null ? null : canonicalSportId(summary.sportId),
    sportKey: summary.sportId === null ? null : sportKeyFor(summary.sportId),
    participant1Id: positiveInt(participants.participant1Id),
    participant2Id: positiveInt(participants.participant2Id),
    participant1Name: null,
    participant2Name: null,
    tournamentId,
    tournamentName: tournamentId === null ? null : text(tournament.tournamentName) || null,
    startTimeMs: unixSecondsToMs(fixture.startTime),
  };
}

export function canonicalFixtureView(value: unknown): V5FixtureDisplay | null {
  return fixtureDisplay(value);
}

function catalogName(
  id: number | null,
  sportId: number | null,
  catalog: Map<number, { name: string; sportId: number | null } | null>,
): string | null {
  if (id === null) return null;
  const row = catalog.get(id);
  if (!row?.name) return null;
  if (row.sportId !== null && sportId !== null && row.sportId !== sportId) return null;
  return row.name;
}

export function applyCatalogNames(
  fixture: V5FixtureDisplay,
  participants: Map<number, { name: string; sportId: number | null } | null>,
  tournaments: Map<number, { name: string; sportId: number | null } | null>,
): V5FixtureDisplay {
  const tournament = catalogName(fixture.tournamentId, null, tournaments);
  return {
    ...fixture,
    participant1Name: catalogName(fixture.participant1Id, fixture.sportId, participants),
    participant2Name: catalogName(fixture.participant2Id, fixture.sportId, participants),
    tournamentName: tournament ?? fixture.tournamentName,
  };
}

function outcomeSide(name: string): '1' | 'x' | '2' | null {
  const value = name.trim().toLowerCase();
  if (value === '1' || value === 'home') return '1';
  if (value === 'x' || value === 'draw') return 'x';
  if (value === '2' || value === 'away') return '2';
  return null;
}

function periodSpecific(value: string): boolean {
  return /half|quarter|period|set|map|inning|1st|2nd|first|second|\bp[1-9]\b|overtime|extra.?time|penalt|\bot\b/.test(value);
}

export function isFullTimeMainMarket(market: V5MarketDefinition): boolean {
  const type = market.marketType.trim().toLowerCase();
  const period = market.period.trim().toLowerCase();
  if (periodSpecific(type) || periodSpecific(period)) return false;
  if (market.handicap !== null && market.handicap !== 0) return false;
  const sides = [...market.outcomes.values()].map(outcomeSide).filter((side) => side !== null);
  if (new Set(sides).size < 2) return false;
  const fullPeriod = period === '' || /^(ft|fulltime|full-time|full time|match|regular|result)$/.test(period);
  const mainType = /^(1x2|moneyline|match winner|winner)$/.test(type);
  return fullPeriod && mainType;
}

const TWO_WAY_SPORT_IDS = new Set<number>([11, 12, 16, 17, 18, 23, 25, 61]);

/**
 * Pick one card-level winner market without rejecting a fixture that has several
 * legitimate full-match families (regulation 1X2 vs overtime-inclusive moneyline).
 */
export function pickPrimaryMainMarket(
  sportId: number | null,
  markets: readonly V5MarketDefinition[],
): V5MarketDefinition | null {
  const mains = markets.filter(isFullTimeMainMarket);
  if (mains.length === 0) return null;
  const prefer = (type: string) => mains.find((market) => market.marketType.trim().toLowerCase() === type);
  if (sportId === 10 || sportId === 15) return prefer('1x2') ?? prefer('moneyline') ?? mains[0] ?? null;
  if (sportId !== null && TWO_WAY_SPORT_IDS.has(sportId)) {
    return prefer('moneyline') ?? prefer('winner') ?? prefer('match winner') ?? prefer('1x2') ?? mains[0] ?? null;
  }
  return prefer('1x2') ?? prefer('moneyline') ?? mains[0] ?? null;
}

export interface V5CardPrices {
  fixtureId: string;
  canonicalEventId: string;
  available: boolean;
  prices: { '1': number | null; x: number | null; '2': number | null };
}

export function cardPricesForFixture(
  fixture: unknown,
  catalog: { byId: Map<number, V5MarketDefinition>; ambiguous: Set<number> },
  now = Date.now(),
): V5CardPrices | null {
  const display = fixtureDisplay(fixture);
  if (!display) return null;
  const empty = { '1': null, x: null, '2': null } as V5CardPrices['prices'];
  const presented = presentV5Quotes(fixture, catalog, now);
  const primary = pickPrimaryMainMarket(
    display.sportId,
    [...new Set(presented.accepted.map((quote) => quote.marketId))]
      .flatMap((marketId) => {
        const market = catalog.byId.get(marketId);
        return market ? [market] : [];
      }),
  );
  if (!primary) return { fixtureId: display.fixtureId, canonicalEventId: display.canonicalEventId, available: false, prices: empty };
  const rows = presented.accepted.filter((quote) => quote.marketId === primary.marketId);
  const prices = { ...empty };
  for (const quote of rows) {
    const side = outcomeSide(quote.outcomeName);
    if (!side || prices[side] !== null) return { fixtureId: display.fixtureId, canonicalEventId: display.canonicalEventId, available: false, prices: empty };
    prices[side] = quote.price;
  }
  const available = prices['1'] !== null && prices['2'] !== null;
  return { fixtureId: display.fixtureId, canonicalEventId: display.canonicalEventId, available, prices: available ? prices : empty };
}
