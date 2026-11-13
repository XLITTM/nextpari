import { toDecimalOdds } from '../../src/lib/decimalOdds.js';

export type Bet365Family =
  | 'full_time_result'
  | 'double_chance'
  | 'btts'
  | 'goal_totals'
  | 'asian_handicap'
  | 'european_handicap'
  | 'half_time'
  | 'correct_score'
  | 'other';

export type Bet365Period = 'full_time' | '1st_half' | '2nd_half';

export interface Bet365Selection {
  selectionId: string;
  name: string;
  price: number | null;
  line: string | null;
  suspended: boolean;
}

export interface Bet365Market {
  marketId: string;
  name: string;
  russianName: string;
  family: Bet365Family;
  period: Bet365Period;
  line: string | null;
  bookmakerId: 'bet365';
  updatedAt: string | null;
  locked: boolean;
  selections: Bet365Selection[];
}

export interface Bet365EventMarkets {
  fi: string;
  eventsId: string | null;
  phase: 'live' | 'prematch';
  updatedAt: string | null;
  stale: boolean;
  markets: Bet365Market[];
}

export interface Bet365EventLink {
  fi: string;
  eventsId: string;
  phase: 'live' | 'prematch';
}

const LIVE_FRESH_MS = 60_000;
const PREMATCH_FRESH_MS = 5 * 60_000;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function digits(value: unknown): string | null {
  const raw = text(value);
  return /^\d{1,20}$/.test(raw) ? raw : null;
}

function lineCandidate(value: unknown, fromName = false): string | null {
  const raw = text(value).replace(/\s+/g, '');
  if (!/^[+-]?\d+(?:\.\d+)?(?:,[+-]?\d+(?:\.\d+)?)*$/.test(raw)) return null;
  if (fromName && !/[.,+-]/.test(raw)) return null;
  return raw;
}

function selectionLine(item: Record<string, unknown>): string | null {
  return lineCandidate(item.HA ?? item.handicap) ?? lineCandidate(item.header) ?? lineCandidate(item.name, true) ?? lineCandidate(item.NA, true);
}

export function linkFromBet365ListRow(row: unknown, phase: 'live' | 'prematch'): Bet365EventLink | null {
  const item = record(row);
  if (!item) return null;
  const fi = digits(item.id);
  const eventsId = digits(item.our_event_id);
  if (!fi || !eventsId || eventsId === '0') return null;
  return { fi, eventsId, phase };
}

export function bet365Directory(payload: unknown, phase: 'live' | 'prematch'): Bet365EventLink[] {
  const body = record(payload);
  const results = Array.isArray(body?.results) ? body.results : [];
  const links: Bet365EventLink[] = [];
  const seen = new Set<string>();
  for (const row of results) {
    const link = linkFromBet365ListRow(row, phase);
    if (!link || seen.has(link.eventsId)) continue;
    seen.add(link.eventsId);
    links.push(link);
  }
  return links;
}

export function findBet365Link(links: readonly Bet365EventLink[], eventsId: string, phase: 'live' | 'prematch'): Bet365EventLink | null {
  return links.find((link) => link.eventsId === eventsId && link.phase === phase) ?? null;
}

function familyOf(marketId: string, name: string, period: Bet365Period): { family: Bet365Family; period: Bet365Period } {
  const label = name.toLowerCase();
  let family: Bet365Family = 'other';
  if (marketId === '40' || /full time result|fulltime result|match winner/.test(label)) family = 'full_time_result';
  else if (marketId === '10114' || /double chance/.test(label)) family = 'double_chance';
  else if (/both teams to score|\bbtts\b/.test(label)) family = 'btts';
  else if (marketId === '43' || /correct score|final score/.test(label)) family = 'correct_score';
  else if (marketId === '11' || /3-way handicap|european handicap/.test(label)) family = 'european_handicap';
  else if (marketId === '938' || marketId === '12' || /asian handicap/.test(label)) family = 'asian_handicap';
  else if (marketId === '981' || marketId === '10143' || marketId === '15' || marketId === '421' || /goal line|goals over|match goals|over\/under|total goals/.test(label)) family = 'goal_totals';
  else if (/half time result|to win 1st half|to win 2nd half/.test(label)) family = 'half_time';
  let resolved = period;
  if (/2nd half|second half/.test(label)) resolved = '2nd_half';
  else if (/1st half|first half|half time/.test(label)) resolved = '1st_half';
  return { family, period: resolved };
}

function russianName(family: Bet365Family, period: Bet365Period, name: string, line: string | null): string {
  const periodPrefix = period === '1st_half' ? '1-й тайм · ' : period === '2nd_half' ? '2-й тайм · ' : '';
  const lineSuffix = line ? ` ${line}` : '';
  if (family === 'full_time_result') return `${periodPrefix}Исход`;
  if (family === 'double_chance') return `${periodPrefix}Двойной шанс`;
  if (family === 'btts') return `${periodPrefix}Обе забьют`;
  if (family === 'goal_totals') return `${periodPrefix}Тотал${lineSuffix}`;
  if (family === 'asian_handicap') return `${periodPrefix}Фора${lineSuffix}`;
  if (family === 'european_handicap') return `${periodPrefix}Европейская фора${lineSuffix}`;
  if (family === 'correct_score') return `${periodPrefix}Точный счёт`;
  if (family === 'half_time') return period === '2nd_half' ? 'Победа во 2-м тайме' : 'Победа в 1-м тайме';
  if (/draw no bet/i.test(name)) return `${periodPrefix}Победа без ничьей`;
  if (/odd\/even/i.test(name)) return `${periodPrefix}Тотал чет/нечет`;
  if (/last team to score/i.test(name)) return `${periodPrefix}Последний гол`;
  if (/^\d+(st|nd|rd|th) goal/i.test(name)) return `${periodPrefix}${name.replace(/(\d+)(st|nd|rd|th) goal/i, '$1-й гол')}`;
  return `${periodPrefix}${name}${lineSuffix}`.trim();
}

function selectionFrom(value: unknown): Bet365Selection | null {
  const item = record(value);
  if (!item) return null;
  const selectionId = digits(item.id ?? item.ID);
  if (!selectionId) return null;
  const suspended = text(item.SU ?? item.su) === '1';
  const price = toDecimalOdds(item.OD ?? item.od ?? item.odds ?? item.price);
  const line = selectionLine(item);
  const header = text(item.header);
  const rawName = text(item.NA ?? item.name);
  const name = lineCandidate(rawName) ? (header && !lineCandidate(header) ? header : rawName) : (rawName || header || '—');
  if (!suspended && !(price > 1)) return null;
  return {
    selectionId,
    name,
    price: suspended || !(price > 1) ? null : price,
    line,
    suspended: suspended || !(price > 1),
  };
}

function buildMarket(
  marketId: string,
  name: string,
  selections: Bet365Selection[],
  period: Bet365Period,
  updatedAt: string | null,
  line: string | null,
): Bet365Market {
  const open = selections.some((selection) => !selection.suspended && (selection.price ?? 0) > 1);
  const classified = familyOf(marketId, name, period);
  return {
    marketId,
    name,
    russianName: russianName(classified.family, classified.period, name, line),
    family: classified.family,
    period: classified.period,
    line,
    bookmakerId: 'bet365',
    updatedAt,
    locked: !open,
    selections,
  };
}

function marketFrom(
  marketId: string,
  name: string,
  odds: unknown,
  period: Bet365Period,
  updatedAt: string | null,
): Bet365Market[] {
  if (!marketId || !name || !Array.isArray(odds)) return [];
  const selections = odds.flatMap((item) => {
    const selection = selectionFrom(item);
    return selection ? [selection] : [];
  });
  if (!selections.length) return [];
  const lines = [...new Set(selections.flatMap((selection) => selection.line ? [selection.line] : []))];
  if (lines.length <= 1) return [buildMarket(marketId, name, selections, period, updatedAt, lines[0] ?? null)];
  return lines.map((line) => buildMarket(
    marketId,
    name,
    selections.filter((selection) => selection.line === line),
    period,
    updatedAt,
    line,
  ));
}

function parseStamp(value: unknown): number | null {
  const raw = text(value);
  if (/^\d{14}$/.test(raw)) {
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6));
    const day = Number(raw.slice(6, 8));
    const hour = Number(raw.slice(8, 10));
    const minute = Number(raw.slice(10, 12));
    const second = Number(raw.slice(12, 14));
    return Date.UTC(year, month - 1, day, hour, minute, second);
  }
  if (/^\d{9,12}$/.test(raw)) return Number(raw) * 1000;
  return null;
}

function staleFor(phase: 'live' | 'prematch', updatedAt: string | null, now: number): boolean {
  const stamp = parseStamp(updatedAt);
  if (stamp == null) return false;
  return now - stamp > (phase === 'live' ? LIVE_FRESH_MS : PREMATCH_FRESH_MS);
}

function walkNamedMarkets(node: unknown, period: Bet365Period, updatedAt: string | null, into: Bet365Market[]): void {
  const item = record(node);
  if (!item) return;
  const odds = item.odds;
  const marketId = text(item.id ?? item.ID);
  const name = text(item.name ?? item.NA);
  if (Array.isArray(odds) && marketId && name) {
    const market = marketFrom(marketId, name, odds, period, updatedAt);
    into.push(...market);
  }
  for (const [key, value] of Object.entries(item)) {
    if (key === 'odds') continue;
    const childPeriod: Bet365Period = key === 'half' || key === 'half_time' ? '1st_half' : period;
    if (Array.isArray(value)) {
      if (key === 'others') {
        for (const entry of value) walkNamedMarkets(entry, childPeriod, updatedAt, into);
      }
      continue;
    }
    if (record(value)) walkNamedMarkets(value, childPeriod, text(record(value)?.updated_at) || updatedAt, into);
  }
}

export function normalizeBet365Prematch(payload: unknown, now = Date.now()): Bet365EventMarkets | null {
  const body = record(payload);
  const row = record(Array.isArray(body?.results) ? body.results[0] : null);
  if (!row) return null;
  const fi = digits(row.FI);
  if (!fi) return null;
  const eventsId = digits(row.event_id);
  const updatedAt = text(record(row.main)?.updated_at) || text(record(row.asian_lines)?.updated_at) || null;
  const markets: Bet365Market[] = [];
  walkNamedMarkets(row.main, 'full_time', updatedAt, markets);
  walkNamedMarkets(row.half, '1st_half', updatedAt, markets);
  walkNamedMarkets(row.asian_lines, 'full_time', text(record(row.asian_lines)?.updated_at) || updatedAt, markets);
  if (Array.isArray(row.others)) {
    for (const entry of row.others) walkNamedMarkets(entry, 'full_time', updatedAt, markets);
  }
  return {
    fi,
    eventsId,
    phase: 'prematch',
    updatedAt,
    stale: staleFor('prematch', updatedAt, now),
    markets,
  };
}

export function normalizeBet365Live(payload: unknown, now = Date.now()): Bet365EventMarkets | null {
  const body = record(payload);
  const results = Array.isArray(body?.results) ? body.results : [];
  const nodes = Array.isArray(results[0]) ? results[0] : results;
  const records = nodes.filter((item) => record(item)) as Array<Record<string, unknown>>;
  const event = records.find((item) => text(item.type) === 'EV');
  const fi = digits(event?.FI ?? event?.ID);
  if (!fi) return null;
  const updatedAt = text(event?.TU ?? event?.updated_at) || null;
  const markets: Bet365Market[] = [];
  let currentId = '';
  let currentName = '';
  let bucket: unknown[] = [];
  const flush = () => {
    const market = marketFrom(currentId, currentName, bucket, 'full_time', updatedAt);
    markets.push(...market);
    bucket = [];
  };
  for (const item of records) {
    const type = text(item.type);
    if (type === 'MG') {
      if (currentName) flush();
      currentId = text(item.ID ?? item.id);
      currentName = text(item.NA ?? item.name);
      continue;
    }
    if (type === 'PA' && currentName) bucket.push(item);
  }
  if (currentName) flush();
  return {
    fi,
    eventsId: digits(event?.our_event_id),
    phase: 'live',
    updatedAt,
    stale: staleFor('live', updatedAt, now),
    markets,
  };
}
