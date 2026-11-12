import { eventsSports, type EventsSportId } from './sportIds.js';
import { toDecimalOdds } from '../../src/lib/decimalOdds.js';
import { footballLiveClock } from './liveClock.js';
import {
  FOOTBALL_SPORT_ID,
  type EventStatus,
  type MarketAvailability,
  type NormalizedEvent,
  type NormalizedMarket,
  type NormalizedOutcome,
  type OutcomeKey,
} from './types.js';

const MARKET_DEFS = [
  { id: '1_1', key: '1x2', name: '1X2' },
  { id: '1_3', key: 'over_under', name: 'Over/Under' },
  { id: '1_2', key: 'asian_handicap', name: 'Asian Handicap' },
] as const;

type MarketDef = { id: string; key: NormalizedMarket['key']; name: string };

function marketDefs(sportId: EventsSportId): readonly MarketDef[] {
  if (sportId === FOOTBALL_SPORT_ID) return MARKET_DEFS;
  return MARKET_DEFS.map((market) => ({
    ...market,
    id: `${sportId}_${market.id.slice(2)}`,
    ...(market.key === '1x2' ? { key: 'moneyline' as const, name: 'Исход' } : {}),
  }));
}

function isOutcomeMarket(def: MarketDef): boolean {
  return def.key === '1x2' || def.key === 'moneyline';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function unixToIso(value: unknown): string | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const ms = parsed > 1_000_000_000_000 ? parsed : parsed > 1_000_000_000 ? parsed * 1000 : null;
  if (ms == null) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function latestIso(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => Boolean(value)).sort();
  return present.length ? present[present.length - 1] : null;
}

export function eventStatusOf(value: unknown): { timeStatus: string; status: EventStatus } | null {
  const timeStatus = text(value);
  if (!/^\d+$/.test(timeStatus)) return null;
  if (timeStatus === '0') return { timeStatus, status: 'prematch' };
  if (timeStatus === '1') return { timeStatus, status: 'live' };
  if (timeStatus === '3') return { timeStatus, status: 'finished' };
  return { timeStatus, status: 'closed' };
}

function priceOf(value: unknown): number {
  if (isRecord(value)) {
    return toDecimalOdds(value.od ?? value.OD ?? value.odd ?? value.odds ?? value.price ?? value.decimal);
  }
  return toDecimalOdds(value);
}

function roundLine(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatMagnitude(value: number): string {
  const rounded = roundLine(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function normalizeHandicapLine(value: unknown): string | null {
  return normalizeLine(value, 'handicap');
}

export function normalizeTotalLine(value: unknown): string | null {
  return normalizeLine(value, 'total');
}

function normalizeLine(value: unknown, kind: 'handicap' | 'total'): string | null {
  const raw = text(value).replace(/\s+/g, '');
  if (!raw) return null;
  const parts = raw.split(',');
  if (parts.length > 2) return null;
  const numbers: number[] = [];
  for (const part of parts) {
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(part)) return null;
    const parsed = Number(part);
    if (!Number.isFinite(parsed)) return null;
    numbers.push(parsed);
  }
  if (kind === 'total' && numbers.some((part) => part <= 0)) return null;
  return numbers.map((part) => {
    if (kind === 'total') return formatMagnitude(part);
    if (part > 0) return `+${formatMagnitude(part)}`;
    if (part < 0) return `-${formatMagnitude(Math.abs(part))}`;
    return '0';
  }).join(',');
}

export function parseFootballScore(value: unknown): { home: number; away: number } | null {
  if (value == null) return null;
  const raw = text(value);
  if (!raw || raw.includes(',')) return null;
  const match = raw.match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (!match) return null;
  return { home: Number(match[1]), away: Number(match[2]) };
}

function scoreFromPeriods(value: unknown): { home: number; away: number } | null {
  if (!isRecord(value)) return null;
  let home = 0;
  let away = 0;
  let found = false;
  for (const [key, period] of Object.entries(value)) {
    if (!/^\d+$/.test(key) || !isRecord(period)) continue;
    const homeText = text(period.home);
    const awayText = text(period.away);
    if (!/^\d+$/.test(homeText) || !/^\d+$/.test(awayText)) return null;
    home += Number(homeText);
    away += Number(awayText);
    found = true;
  }
  return found ? { home, away } : null;
}

function footballScore(
  row: Record<string, unknown>,
  status: EventStatus,
): { home: number; away: number } | null {
  if (status !== 'live' && status !== 'finished') return null;
  return parseFootballScore(row.ss) ?? scoreFromPeriods(row.scores);
}

function teamOf(value: unknown): { id: string | null; name: string } | null {
  if (typeof value === 'string') {
    const name = value.trim();
    return name ? { id: null, name } : null;
  }
  if (!isRecord(value)) return null;
  const name = text(value.name);
  if (!name) return null;
  return { id: text(value.id) || null, name };
}

function leagueOf(row: Record<string, unknown>): NormalizedEvent['league'] {
  const league = isRecord(row.league) ? row.league : {};
  const home = isRecord(row.home) ? row.home : {};
  const country = text(league.cc || home.cc).toLowerCase();
  return {
    id: text(league.id) || null,
    name: text(league.name) || null,
    countryCode: /^[a-z]{2}$/.test(country) ? country.toUpperCase() : null,
  };
}

const SNAPSHOT_KEYS = ['live', 'current', 'end', 'kickoff', 'start'] as const;

export type OddsDiagnosis = 'open' | 'suspended' | 'unavailable' | 'unrecognized';

interface PricedRow {
  row: Record<string, unknown>;
  bookmakerId: string | null;
  externalPeriodId: string | null;
}

function hasPriceField(row: Record<string, unknown>): boolean {
  return ['home_od', 'draw_od', 'away_od', 'over_od', 'under_od', 'od', 'OD', 'odd', 'odds', 'price']
    .some((key) => key in row);
}

function bookmakerOf(row: Record<string, unknown>, inherited: string | null): string | null {
  const direct = text(row.bookmaker_id ?? row.bookmakerId ?? row.bm);
  if (direct) return direct;
  const named = row.bookmaker;
  if (typeof named === 'string' || typeof named === 'number') {
    const value = text(named);
    if (value) return value;
  }
  return inherited;
}

function collectPriced(
  node: unknown,
  bookmakerId: string | null,
  externalPeriodId: string | null,
): PricedRow[] {
  if (Array.isArray(node)) {
    return node.flatMap((item) => collectPriced(item, bookmakerId, externalPeriodId));
  }
  if (!isRecord(node)) return [];
  if (hasPriceField(node)) {
    return [{
      row: node,
      bookmakerId: bookmakerOf(node, bookmakerId),
      externalPeriodId: text(node.period ?? node.time_period) || externalPeriodId,
    }];
  }
  const snapshots = SNAPSHOT_KEYS.filter((key) => key in node);
  if (snapshots.length) {
    return snapshots.flatMap((key) => collectPriced(node[key], bookmakerId, key));
  }
  const entries = Object.entries(node);
  if (entries.length > 0 && entries.every(([key]) => /^\d+$/.test(key))) {
    return entries.flatMap(([key, value]) => collectPriced(value, key, externalPeriodId));
  }
  return entries.flatMap(([, value]) => collectPriced(value, bookmakerId, externalPeriodId));
}

function findMarketNodes(root: Record<string, unknown>, defs: readonly MarketDef[] = MARKET_DEFS): Record<string, unknown> {
  const found: Record<string, unknown> = {};
  const visit = (value: unknown, depth: number) => {
    if (depth > 4 || !isRecord(value)) return;
    for (const [key, nested] of Object.entries(value)) {
      if (defs.some((def) => def.id === key)) {
        if (!(key in found)) found[key] = nested;
        continue;
      }
      if (key === 'stats' || key === 'ss' || key === 'timer' || key === 'scores') continue;
      visit(nested, depth + 1);
    }
  };
  visit(root, 0);
  return found;
}

function oddsContainer(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;
  if (isRecord(payload.results)) return oddsContainer(payload.results);
  if (isRecord(payload.odds)) return payload.odds;
  if ('1_1' in payload || '1_2' in payload || '1_3' in payload) return payload;
  return payload;
}

function rowTime(row: Record<string, unknown>): number {
  const parsed = Number(row.add_time ?? row.odds_update ?? row.updated_at ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowSuspended(row: Record<string, unknown>): boolean {
  for (const key of ['suspended', 'su', 'is_suspended', 'market_suspended']) {
    const value = row[key];
    if (value === true || value === 1 || value === '1') return true;
    const textValue = text(value).toLowerCase();
    if (textValue === 'true' || textValue === 'yes' || textValue === 'suspended') return true;
  }
  const status = text(row.status ?? row.market_status ?? row.odd_status).toLowerCase();
  return status === 'suspended' || status === 'closed' || status === 'locked' || status === 'unavailable';
}

function readPrice(row: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    if (!(key in row)) continue;
    return priceOf(row[key]);
  }
  return 0;
}

function outcome(
  key: OutcomeKey,
  name: string,
  price: number,
  sourceSelectionId: string | null,
): NormalizedOutcome | null {
  if (!(price > 1)) return null;
  return sourceSelectionId ? { key, name, price, sourceSelectionId } : { key, name, price };
}

function selectionId(row: Record<string, unknown>, key: OutcomeKey): string | null {
  const specific = text(row[`${key}_id`] ?? row[`${key}_od_id`]);
  return specific || null;
}

function closedMarket(
  def: MarketDef,
  line: string | null,
  updatedAt: string | null,
  identity: { bookmakerId?: string | null; externalPeriodId?: string | null; availability?: MarketAvailability } = {},
): NormalizedMarket {
  return {
    key: def.key,
    name: def.name,
    line,
    status: 'closed',
    outcomes: [],
    updatedAt,
    bookmakerId: identity.bookmakerId ?? null,
    externalPeriodId: identity.externalPeriodId ?? null,
    externalMarketId: def.id,
    availability: identity.availability ?? 'unavailable',
  };
}

function lineOf(def: MarketDef, row: Record<string, unknown>): string | null {
  if (isOutcomeMarket(def)) return null;
  const raw = row.handicap ?? row.line ?? row.ha ?? row.hd ?? row.goal_line;
  return def.key === 'over_under' ? normalizeTotalLine(raw) : normalizeHandicapLine(raw);
}

function rowMatchesMarket(def: MarketDef, row: Record<string, unknown>): boolean {
  const handicap = text(row.handicap ?? row.line ?? row.ha ?? row.hd ?? row.goal_line);
  if (isOutcomeMarket(def)) return !handicap && row.over_od == null && row.under_od == null;
  if (def.key === 'over_under') return row.draw_od == null || row.over_od != null || row.under_od != null;
  return row.draw_od == null && row.over_od == null && row.under_od == null;
}

function marketFromPriced(def: MarketDef, priced: PricedRow): NormalizedMarket {
  const row = priced.row;
  const updatedAt = unixToIso(row.add_time ?? row.odds_update ?? row.updated_at);
  const line = lineOf(def, row);
  const identity = {
    bookmakerId: priced.bookmakerId,
    externalPeriodId: priced.externalPeriodId,
    availability: 'unavailable' as MarketAvailability,
  };
  if (rowSuspended(row)) return closedMarket(def, line, updatedAt, { ...identity, availability: 'suspended' });
  if (!rowMatchesMarket(def, row)) return closedMarket(def, line, updatedAt, identity);
  if (!isOutcomeMarket(def) && !line) return closedMarket(def, null, updatedAt, identity);

  // Generic Events handicap rows do not document an unambiguous signed side.
  if (def.id !== '1_2' && def.key === 'asian_handicap' && line !== '0') {
    return closedMarket(def, line, updatedAt, { ...identity, availability: 'suspended' });
  }
  let outcomes: Array<NormalizedOutcome | null>;
  if (isOutcomeMarket(def)) {
    outcomes = [
      outcome('home', 'Home', readPrice(row, ['home_od', 'home']), selectionId(row, 'home')),
      ...(def.key === '1x2' || (row.draw_od != null && text(row.draw_od) !== '') || row.draw != null
        ? [outcome('draw', 'Draw', readPrice(row, ['draw_od', 'draw']), selectionId(row, 'draw'))] : []),
      outcome('away', 'Away', readPrice(row, ['away_od', 'away']), selectionId(row, 'away')),
    ];
  } else if (def.key === 'over_under') {
    outcomes = [
      outcome('over', 'Over', readPrice(row, ['over_od', 'over']), selectionId(row, 'over')),
      outcome('under', 'Under', readPrice(row, ['under_od', 'under']), selectionId(row, 'under')),
    ];
  } else {
    outcomes = [
      outcome('home', 'Home', readPrice(row, ['home_od', 'home']), selectionId(row, 'home')),
      outcome('away', 'Away', readPrice(row, ['away_od', 'away']), selectionId(row, 'away')),
    ];
  }
  if (outcomes.some((item) => item == null)) return closedMarket(def, line, updatedAt, identity);
  return {
    key: def.key === 'moneyline' && outcomes.length === 3 ? '1x2' : def.key,
    name: def.name,
    line,
    status: 'open',
    outcomes: outcomes as NormalizedOutcome[],
    updatedAt,
    bookmakerId: priced.bookmakerId,
    externalPeriodId: priced.externalPeriodId,
    externalMarketId: def.id,
    availability: 'open',
  };
}

function latestRows(def: MarketDef, rows: PricedRow[]): NormalizedMarket[] {
  const grouped = new Map<string, { priced: PricedRow; order: number; conflict?: boolean }>();
  rows.forEach((priced, order) => {
    const line = lineOf(def, priced.row);
    const key = JSON.stringify([line, priced.bookmakerId, priced.externalPeriodId]);
    const prev = grouped.get(key);
    if (!prev || rowTime(priced.row) > rowTime(prev.priced.row)) {
      grouped.set(key, { priced, order });
    } else if (rowTime(priced.row) === rowTime(prev.priced.row)) {
      if (def.id.startsWith('1_')) grouped.set(key, { priced, order });
      else if (JSON.stringify(marketFromPriced(def, prev.priced)) !== JSON.stringify(marketFromPriced(def, priced))) {
        prev.conflict = true;
      }
    }
  });
  const markets = [...grouped.values()]
    .sort((left, right) => left.order - right.order)
    .map(({ priced, conflict }) => conflict
      ? closedMarket(def, lineOf(def, priced.row), unixToIso(priced.row.add_time), {
        bookmakerId: priced.bookmakerId, externalPeriodId: priced.externalPeriodId, availability: 'suspended',
      })
      : marketFromPriced(def, priced));
  return markets.length ? markets : [closedMarket(def, null, null)];
}

export function eventWithOdds(event: NormalizedEvent, oddsPayload: unknown): NormalizedEvent {
  return { ...event, marketsKnown: true, markets: marketsFromOddsPayload(oddsPayload) };
}

export function marketsFromOddsPayload(payload: unknown, sportId: EventsSportId = FOOTBALL_SPORT_ID): NormalizedMarket[] {
  const defs = marketDefs(sportId);
  if (sportId !== FOOTBALL_SPORT_ID) {
    const results = isRecord(payload) && isRecord(payload.results) ? payload.results : null;
    if (!results || !isRecord(results.stats) || text(results.stats.matching_dir) !== '1') return [];
  }
  const container = oddsContainer(payload);
  if (!container) return defs.map((def) => closedMarket(def, null, null));
  const nodes = findMarketNodes(container, defs);
  return defs.flatMap((def) => {
    if (!(def.id in nodes)) return [closedMarket(def, null, null)];
    return latestRows(def, collectPriced(nodes[def.id], null, null));
  });
}

export function diagnoseOddsPayload(payload: unknown): OddsDiagnosis {
  const container = oddsContainer(payload);
  if (!container) return 'unavailable';
  const nodes = findMarketNodes(container);
  const present = MARKET_DEFS.filter((def) => def.id in nodes);
  if (!present.length) return 'unavailable';
  const priced = present.flatMap((def) => collectPriced(nodes[def.id], null, null));
  if (!priced.length) return 'unrecognized';
  const markets = marketsFromOddsPayload(payload);
  if (markets.some((market) => market.status === 'open')) return 'open';
  if (markets.some((market) => market.availability === 'suspended')) return 'suspended';
  return 'unavailable';
}

function embeddedOdds(row: Record<string, unknown>): Record<string, unknown> | null {
  const extra = isRecord(row.extra) ? row.extra : {};
  const blob = row.odds ?? extra.odds ?? row.main ?? extra.main;
  return isRecord(blob) ? blob : null;
}

function flatFamily(row: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  const extra = isRecord(row.extra) ? row.extra : {};
  const flat: Record<string, unknown> = {};
  let present = false;
  for (const key of keys) {
    if (row[key] != null) {
      flat[key] = row[key];
      present = true;
    } else if (extra[key] != null) {
      flat[key] = extra[key];
      present = true;
    }
  }
  return present ? flat : null;
}

function onlyMarket(payload: Record<string, unknown>, key: NormalizedMarket['key']): NormalizedMarket[] {
  return marketsFromOddsPayload(payload).filter((market) => market.key === key);
}

function marketsFromEmbedded(row: Record<string, unknown>): { marketsKnown: boolean; markets: NormalizedMarket[] } {
  const embedded = embeddedOdds(row);
  if (embedded) return { marketsKnown: true, markets: marketsFromOddsPayload(embedded) };
  const extra = isRecord(row.extra) ? row.extra : {};
  const money = flatFamily(row, ['home_od', 'draw_od', 'away_od']);
  const totals = flatFamily(row, ['over_od', 'under_od']);
  const handicapValue = row.handicap ?? extra.handicap;
  const markets: NormalizedMarket[] = [];
  if (money) markets.push(...onlyMarket({ '1_1': [money] }, '1x2'));
  if (totals) {
    const line = row.total ?? extra.total ?? handicapValue;
    markets.push(...onlyMarket({
      '1_3': [{ over_od: totals.over_od, under_od: totals.under_od, handicap: line }],
    }, 'over_under'));
  }
  // 1X2 prices must not be reused as Asian Handicap prices.
  if (text(handicapValue) && !totals && !(money && money.draw_od != null)) {
    const prices = flatFamily(row, ['home_od', 'away_od']);
    markets.push(...onlyMarket({
      '1_2': [{ home_od: prices?.home_od, away_od: prices?.away_od, handicap: handicapValue }],
    }, 'asian_handicap'));
  }
  if (!markets.length) return { marketsKnown: false, markets: [] };
  return { marketsKnown: true, markets };
}

export function normalizeFootballEvent(row: unknown, oddsPayload?: unknown, observedAtMs?: number): NormalizedEvent | null {
  return normalizeSportEvent(row, FOOTBALL_SPORT_ID, oddsPayload, observedAtMs);
}

export function normalizeSportEvent(row: unknown, sportId: EventsSportId, oddsPayload?: unknown, observedAtMs?: number): NormalizedEvent | null {
  if (!isRecord(row) || text(row.sport_id ?? row.sportId) !== sportId) return null;
  const eventId = text(row.id);
  if (!/^\d+$/.test(eventId)) return null;
  const status = eventStatusOf(row.time_status);
  if (!status) return null;
  const home = teamOf(row.home);
  const away = teamOf(row.away);
  if (!home || !away) return null;
  const football = sportId === FOOTBALL_SPORT_ID;
  if (!football && (!home.id || !away.id || home.id === away.id || !leagueOf(row).id)) return null;
  const priced = oddsPayload === undefined
    ? football ? marketsFromEmbedded(row) : { marketsKnown: false, markets: [] }
    : { marketsKnown: true, markets: marketsFromOddsPayload(oddsPayload, sportId) };
  return {
    eventId,
    sportId,
    sport: eventsSports[sportId],
    league: leagueOf(row),
    home,
    away,
    kickoff: unixToIso(row.time),
    status: status.status,
    timeStatus: status.timeStatus,
    score: football ? footballScore(row, status.status) : parseFootballScore(row.ss),
    liveClock: football && status.status === 'live' ? footballLiveClock(row.timer, observedAtMs) : null,
    marketsKnown: priced.marketsKnown,
    markets: priced.markets,
    updatedAt: latestIso(priced.markets.map((market) => market.updatedAt)),
  };
}

function listRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  return Array.isArray(payload.results) ? payload.results : [];
}

export function normalizeFootballList(
  payload: unknown,
  endpoint: 'inplay' | 'upcoming' | 'ended',
  observedAtMs?: number,
  sportId: EventsSportId = FOOTBALL_SPORT_ID,
): NormalizedEvent[] {
  const allowed: Record<typeof endpoint, EventStatus[]> = {
    inplay: ['live'],
    upcoming: ['prematch'],
    ended: ['finished', 'closed'],
  };
  const events: NormalizedEvent[] = [];
  for (const row of listRows(payload)) {
    const event = normalizeSportEvent(row, sportId, undefined, observedAtMs);
    if (!event || !allowed[endpoint].includes(event.status)) continue;
    events.push(event);
  }
  return events;
}

function viewRecord(payload: unknown): unknown | null {
  if (!isRecord(payload)) return null;
  const results = payload.results ?? payload;
  if (Array.isArray(results)) return results[0] ?? null;
  return isRecord(results) ? results : null;
}

export function normalizeFootballDetails(
  viewPayload: unknown,
  oddsPayload: unknown | null,
  observedAtMs?: number,
  sportId: EventsSportId = FOOTBALL_SPORT_ID,
): NormalizedEvent | null {
  const row = viewRecord(viewPayload);
  return normalizeSportEvent(row, sportId, oddsPayload ?? undefined, observedAtMs);
}
