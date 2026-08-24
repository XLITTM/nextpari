import type { ParsedMarket, ParsedOutcome } from './odds-parser';

export interface MainOdds {
  home: number;
  draw: number;
  away: number;
}

export interface DoubleChanceOdds {
  oneX: number;
  twelve: number;
  x2: number;
}

const LOCKED = new Set(['', '-', '0', '0.00', 'sp', 'susp', 'suspended', 'lock', 'locked', 'off']);

export function roundOdds(value: number): number {
  if (!Number.isFinite(value) || value <= 1) return 0;
  return Math.round(Math.min(value, 101) * 1000) / 1000;
}

export function formatOdds(value: number): string {
  if (!Number.isFinite(value) || value <= 1) return '—';
  const three = roundOdds(value).toFixed(3);
  return three.endsWith('0') ? Number(three).toFixed(2) : three;
}

export function toDecimalOdds(value: unknown): number {
  if (value == null || typeof value === 'boolean') return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value === 0) return 0;
    if (value <= -100) return roundOdds(1 + 100 / Math.abs(value));
    if (value >= 100) return roundOdds(1 + value / 100);
    if (value > 1) return roundOdds(value);
    return 0;
  }

  const text = String(value).trim();
  if (!text || LOCKED.has(text.toLowerCase())) return 0;
  if (/^[+-]\d+(?:\.\d+)?$/.test(text)) {
    const american = Number(text);
    if (american <= -100) return roundOdds(1 + 100 / Math.abs(american));
    if (american >= 100) return roundOdds(1 + american / 100);
  }
  if (text.includes('/')) {
    const [left, right] = text.split('/').map((part) => Number(part.replace(',', '.')));
    if (right) return roundOdds(left / right + 1);
  }

  const numeric = Number(text.replace(',', '.'));
  if (!Number.isFinite(numeric) || numeric === 0) return 0;
  if (numeric <= -100) return roundOdds(1 + 100 / Math.abs(numeric));
  if (numeric >= 100 && numeric <= 10000) return roundOdds(1 + numeric / 100);
  if (numeric > 1) return roundOdds(numeric);
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function latestRow(rows: unknown): Record<string, unknown> | null {
  if (!Array.isArray(rows) || !rows.length) return asRecord(rows);
  const scored = rows
    .map((row) => asRecord(row))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .sort((a, b) => Number(b.add_time ?? b.odds_update ?? 0) - Number(a.add_time ?? a.odds_update ?? 0));
  return scored[0] ?? null;
}

function hasHandicapLine(row: Record<string, unknown> | null): boolean {
  if (!row) return false;
  const line = row.handicap ?? row.line ?? row.goal_line ?? row.ha;
  return line != null && String(line) !== '';
}

function ftKeys(sportId?: string): string[] {
  const sport = String(sportId || '1');
  return sport === '1' ? ['1_1'] : [`${sport}_1`, '1_1'];
}

export function extractFt1x2(odds: Record<string, unknown>, sportId?: string): MainOdds | null {
  for (const key of ftKeys(sportId)) {
    const row = latestRow(odds[key]);
    if (!row || hasHandicapLine(row)) continue;
    const home = toDecimalOdds(row.home_od ?? row.home);
    const draw = toDecimalOdds(row.draw_od ?? row.draw ?? row.x);
    const away = toDecimalOdds(row.away_od ?? row.away);
    if (home > 1 && away > 1) return { home, draw, away };
  }
  return null;
}

function looksLikeDoubleChance(row: Record<string, unknown> | null): boolean {
  if (!row || hasHandicapLine(row)) return false;
  const oneX = toDecimalOdds(row['1x_od'] ?? row.one_x_od ?? row.dc_1x ?? row.home_od);
  const twelve = toDecimalOdds(row['12_od'] ?? row.one_two_od ?? row.dc_12 ?? row.draw_od);
  const x2 = toDecimalOdds(row.x2_od ?? row.dc_x2 ?? row.away_od);
  return oneX > 1 && twelve > 1 && x2 > 1 && !row.over_od && !row.under_od;
}

export function extractDoubleChance(odds: Record<string, unknown>, sportId?: string): DoubleChanceOdds | null {
  const sport = String(sportId || '1');
  const keys = [`${sport}_dc`, `${sport}_2`, '1_2', 'dc', 'double_chance'];
  for (const key of keys) {
    const row = latestRow(odds[key]);
    if (!looksLikeDoubleChance(row) || !row) continue;
    if (key.endsWith('_2') && hasHandicapLine(row)) continue;
    const oneX = toDecimalOdds(row['1x_od'] ?? row.one_x_od ?? row.dc_1x ?? row.home_od);
    const twelve = toDecimalOdds(row['12_od'] ?? row.one_two_od ?? row.dc_12 ?? row.draw_od);
    const x2 = toDecimalOdds(row.x2_od ?? row.dc_x2 ?? row.away_od);
    if (oneX > 1 && twelve > 1 && x2 > 1) return { oneX, twelve, x2 };
  }
  return null;
}

export function extractBtts(odds: Record<string, unknown>, sportId?: string): { yes: number; no: number } | null {
  const sport = String(sportId || '1');
  const preferred = [`${sport}_btts`, `${sport}_13`, `${sport}_3`, '1_3', 'btts'];
  const extra = Object.keys(odds).filter((key) => /btts|both.?team|\bgg\b|\bbtts\b/i.test(key));
  const seen = new Set<string>();
  for (const key of [...preferred, ...extra]) {
    if (seen.has(key)) continue;
    seen.add(key);
    const row = latestRow(odds[key]);
    if (!row || hasHandicapLine(row) || row.over_od != null || row.under_od != null) continue;
    const yes = toDecimalOdds(row.yes_od ?? row.btts_yes_od ?? row.gg_od ?? row.both_yes);
    const no = toDecimalOdds(row.no_od ?? row.btts_no_od ?? row.ng_od ?? row.both_no);
    if (yes > 1 && no > 1) return { yes, no };
  }
  return null;
}

export function doubleChanceFrom1x2(home: number, draw: number, away: number): DoubleChanceOdds | null {
  const combo = (a: number, b: number) => {
    if (a <= 1 || b <= 1) return 0;
    return roundOdds(1 / (1 / a + 1 / b));
  };
  const oneX = combo(home, draw);
  const twelve = combo(home, away);
  const x2 = combo(draw, away);
  if (!oneX || !twelve || !x2) return null;
  return { oneX, twelve, x2 };
}

function outcome(key: string, odds: number): ParsedOutcome | null {
  if (odds <= 1) return null;
  return { key, odds, raw: formatOdds(odds) };
}

function asMarket(
  key: string,
  marketId: string,
  name: string,
  outcomes: Array<ParsedOutcome | null>,
): ParsedMarket | null {
  const list = outcomes.filter((row): row is ParsedOutcome => Boolean(row));
  if (!list.length) return null;
  return {
    key,
    bookmaker: 'bet365',
    marketId,
    name,
    category: 'main',
    entries: [{
      id: `${marketId}-main`,
      outcomes: list,
      updatedAt: Date.now(),
    }],
  };
}

export function isFullTime1x2(market: ParsedMarket): boolean {
  if (/тайм|half|1st|2nd|четверт/i.test(market.name) || market.marketId === '8') return false;
  return market.key === '1_1' || market.key.endsWith('_1') || market.marketId === '1';
}

export function isDoubleChanceMarket(market: ParsedMarket): boolean {
  return market.marketId === 'dc' || /двойной шанс|double chance/i.test(market.name);
}

export function isBttsMarket(market: ParsedMarket): boolean {
  return market.marketId === 'btts' || /обе забьют|btts|both teams/i.test(market.name);
}

function outcomeKeys(market: ParsedMarket): Set<string> {
  const keys = new Set<string>();
  for (const entry of market.entries) {
    for (const row of entry.outcomes) keys.add(row.key.toLowerCase());
  }
  return keys;
}

function looksLikeDcMarket(market: ParsedMarket): boolean {
  if (market.entries.some((entry) => Boolean(entry.line))) return false;
  const keys = outcomeKeys(market);
  return keys.has('1x') && keys.has('12') && (keys.has('x2') || keys.has('2x')) && !keys.has('over') && !keys.has('under');
}

function looksLikeBttsMarket(market: ParsedMarket): boolean {
  if (market.entries.some((entry) => Boolean(entry.line))) return false;
  const keys = outcomeKeys(market);
  return (keys.has('yes') || keys.has('да')) && (keys.has('no') || keys.has('нет')) && !keys.has('over') && !keys.has('under');
}

export function enrichProviderMarkets(
  markets: ParsedMarket[],
  oddsDict?: Record<string, unknown>,
  sportId?: string,
): ParsedMarket[] {
  const next = markets.map((market) => {
    if ((market.key === '1_2' || market.key.endsWith('_2') || market.marketId === '2') && looksLikeDcMarket(market)) {
      return { ...market, name: 'Двойной шанс', marketId: 'dc', category: 'main' as const };
    }
    if ((market.key === '1_3' || market.key.endsWith('_3') || market.marketId === '3') && looksLikeBttsMarket(market)) {
      return { ...market, name: 'Обе забьют', marketId: 'btts', category: 'main' as const };
    }
    return market;
  });
  const ft = extractFt1x2(oddsDict ?? {}, sportId);
  if (ft && !next.some(isFullTime1x2)) {
    const row = asMarket('1_1', '1', '1X2', [
      outcome('home', ft.home),
      outcome('draw', ft.draw),
      outcome('away', ft.away),
    ]);
    if (row) next.unshift(row);
  }

  if (!next.some(isDoubleChanceMarket)) {
    const fromApi = oddsDict ? extractDoubleChance(oddsDict, sportId) : null;
    const dc = fromApi ?? (ft ? doubleChanceFrom1x2(ft.home, ft.draw, ft.away) : null);
    const row = dc
      ? asMarket('1_dc', 'dc', 'Двойной шанс', [
        outcome('1x', dc.oneX),
        outcome('12', dc.twelve),
        outcome('x2', dc.x2),
      ])
      : null;
    if (row) next.push(row);
  }

  if (!next.some(isBttsMarket) && oddsDict) {
    const btts = extractBtts(oddsDict, sportId);
    const row = btts
      ? asMarket('1_btts', 'btts', 'Обе забьют', [
        outcome('yes', btts.yes),
        outcome('no', btts.no),
      ])
      : null;
    if (row) next.push(row);
  }

  return next;
}
