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
  outcomeName: string;
  period: string;
  handicap: number | null;
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
): { accepted: V5CanonicalQuote[]; rejected: number } {
  const summary = summarizeV5Fixture(fixture);
  const active = extractActiveV5Quotes(fixture);
  if (!summary) return { accepted: [], rejected: active.length };
  const accepted: V5CanonicalQuote[] = [];
  let rejected = 0;
  const seenNames = new Map<number, Set<string>>();
  for (const quote of active) {
    const market = catalog.byId.get(quote.marketId);
    const outcomeName = market?.outcomes.get(quote.outcomeId) ?? '';
    const at = changedAtMs(quote.changedAt);
    const freshFor = summary.live ? LIVE_FRESH_MS : PREMATCH_FRESH_MS;
    const names = seenNames.get(quote.marketId) ?? new Set<string>();
    const duplicateSide = outcomeName !== '' && names.has(outcomeName.toLowerCase());
    const oriented = !market || !needsOrientation(market) || ORIENTED.test(outcomeName.trim());
    const safe = market
      && !catalog.ambiguous.has(quote.marketId)
      && outcomeName
      && oriented
      && !duplicateSide
      && at !== null
      && now - at <= freshFor
      && now - at >= -60_000;
    if (!safe || !market) {
      rejected += 1;
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
      outcomeName,
      period: market.period,
      handicap: market.handicap,
    });
  }
  return { accepted, rejected };
}

function participantLabel(fixture: Record<string, unknown>, index: number): string | null {
  const direct = text(fixture[index === 0 ? 'participant1Name' : 'participant2Name']);
  if (direct) return direct;
  const participants = fixture.participants;
  if (!Array.isArray(participants)) return null;
  const participant = record(participants[index]);
  return text(participant.name) || text(participant.participantName) || null;
}

export function canonicalFixtureView(value: unknown) {
  const summary = summarizeV5Fixture(value);
  if (!summary) return null;
  const fixture = record(value);
  return {
    ...summary,
    canonicalEventId: canonicalEventId(summary.fixtureId),
    canonicalSportId: summary.sportId === null ? null : canonicalSportId(summary.sportId),
    sportKey: summary.sportId === null ? null : sportKeyFor(summary.sportId),
    participant1Name: participantLabel(fixture, 0),
    participant2Name: participantLabel(fixture, 1),
    tournamentName: text(record(fixture.tournament).tournamentName) || text(fixture.tournamentName) || null,
    startTime: text(fixture.startTime) || text(fixture.startTimeUtc) || null,
  };
}
