import type { MarketCategory, MarketGroup } from '../types';

export interface ParsedOutcome {
  key: string;
  odds: number;
  raw: string;
}

export interface ParsedMarketEntry {
  id: string;
  outcomes: ParsedOutcome[];
  line?: string;
  ss?: string;
  time?: string;
  updatedAt: number;
}

export interface ParsedMarket {
  key: string;
  bookmaker: string;
  marketId: string;
  name: string;
  category: 'main' | 'half' | 'corners' | 'quarter' | 'specials';
  entries: ParsedMarketEntry[];
}

const NAMES: Record<string, { n: string; c: ParsedMarket['category'] }> = {
  '1': { n: '1X2', c: 'main' },
  '2': { n: 'Фора', c: 'main' },
  '3': { n: 'Тотал', c: 'main' },
  '4': { n: 'Угловые (фора)', c: 'corners' },
  '5': { n: '1-й тайм фора', c: 'half' },
  '6': { n: '1-й тайм тотал', c: 'half' },
  '7': { n: '1-й тайм угловые', c: 'half' },
  '8': { n: 'Тайм 1X2', c: 'half' },
  '13': { n: 'Угловые (тотал)', c: 'corners' },
  '17': { n: 'Карточки', c: 'specials' },
  '1_1': { n: '1X2', c: 'main' },
  '1_2': { n: 'Фора', c: 'main' },
  '1_3': { n: 'Тотал', c: 'main' },
  '1_4': { n: 'Угловые (фора)', c: 'corners' },
  '1_5': { n: '1-й тайм фора', c: 'half' },
  '1_6': { n: '1-й тайм тотал', c: 'half' },
  '1_7': { n: '1-й тайм угловые', c: 'half' },
  '1_8': { n: 'Тайм 1X2', c: 'half' },
  '18_1': { n: 'Победитель', c: 'main' },
  '18_2': { n: 'Фора', c: 'main' },
  '18_3': { n: 'Тотал', c: 'main' },
  '18_4': { n: 'Половина победитель', c: 'half' },
  '18_5': { n: 'Половина фора', c: 'half' },
  '18_6': { n: 'Половина тотал', c: 'half' },
  '18_7': { n: 'Четверть победитель', c: 'quarter' },
  '18_8': { n: 'Четверть фора', c: 'quarter' },
  '18_9': { n: 'Четверть тотал', c: 'quarter' },
  '13_1': { n: 'Победитель матча', c: 'main' },
  '13_2': { n: 'Фора по геймам', c: 'main' },
  '13_3': { n: 'Тотал геймов', c: 'main' },
};

const OUTCOME_LABEL: Record<string, string> = {
  home: 'П1',
  away: 'П2',
  draw: 'X',
  over: 'ТБ',
  under: 'ТМ',
  '1': 'П1',
  '2': 'П2',
  x: 'X',
};

const MAIN_MARKET_IDS = new Set(['1', '2', '3']);
const FOOTBALL_ONLY_IDS = new Set(['4', '5', '6', '7', '8', '13', '17']);

function resolveName(marketId: string, sportId?: string, composite?: string) {
  if (MAIN_MARKET_IDS.has(marketId)) {
    const sportKey = sportId ? `${sportId}_${marketId}` : marketId;
    const named = NAMES[sportKey] || NAMES[marketId] || NAMES[composite ?? ''];
    const fallbackName = marketId === '1'
      ? sportId && sportId !== '1' ? 'Победитель матча' : '1X2'
      : marketId === '2' ? 'Фора' : 'Тотал';
    return {
      n: named?.n ?? fallbackName,
      c: 'main' as const,
    };
  }
  const sportNamed = sportId ? NAMES[`${sportId}_${marketId}`] : undefined;
  if (sportNamed) return sportNamed;
  if (composite && NAMES[composite]) return NAMES[composite];
  if (sportId && sportId !== '1' && FOOTBALL_ONLY_IDS.has(marketId)) {
    return { n: `Маркет ${marketId}`, c: 'specials' as const };
  }
  return NAMES[marketId] || { n: `Маркет ${marketId}`, c: 'specials' as const };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const OUTCOME_KEY_ORDER: Record<string, number> = {
  home: 0,
  '1': 0,
  p1: 0,
  draw: 1,
  x: 1,
  tie: 1,
  away: 2,
  '2': 2,
  p2: 2,
  over: 0,
  under: 1,
};

function extractOutcomes(item: Record<string, unknown>): ParsedOutcome[] {
  const out: ParsedOutcome[] = [];
  for (const [k, v] of Object.entries(item)) {
    if (!k.endsWith('_od') || v == null) continue;
    const num = parseFloat(String(v));
    if (!Number.isNaN(num) && num > 0) {
      out.push({ key: k.replace('_od', ''), odds: num, raw: String(v) });
    }
  }
  return out.sort((a, b) => {
    const oa = OUTCOME_KEY_ORDER[a.key.toLowerCase()] ?? 50;
    const ob = OUTCOME_KEY_ORDER[b.key.toLowerCase()] ?? 50;
    return oa - ob;
  });
}

function asLine(item: Record<string, unknown>): string | undefined {
  const raw = item.handicap ?? item.line ?? item.goal_line ?? item.ha;
  if (raw == null || raw === '') return undefined;
  return String(raw);
}

function asUnix(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  return n > 1e12 ? n : n * 1000;
}

export function parseOdds(raw: Record<string, unknown[]>, opts?: { sportId?: string }): ParsedMarket[] {
  const markets: ParsedMarket[] = [];
  for (const [composite, items] of Object.entries(raw)) {
    const parts = composite.split('_').filter(Boolean);
    const marketId = parts.length >= 2 ? (parts[parts.length - 1] ?? composite) : composite;
    const bookmaker = parts.length >= 2 ? parts.slice(0, -1).join('_') : 'bet365';
    const info = resolveName(marketId, opts?.sportId, composite);
    const entries: ParsedMarketEntry[] = (items || []).filter(isRecord).map((it) => ({
      id: String(it.id ?? `${composite}-${asLine(it) ?? 'main'}`),
      outcomes: extractOutcomes(it),
      line: asLine(it),
      ss: it.ss != null ? String(it.ss) : undefined,
      time: it.time_str != null ? String(it.time_str) : it.time != null ? String(it.time) : undefined,
      updatedAt: asUnix(it.odds_update ?? it.add_time),
    })).filter((entry) => entry.outcomes.length > 0);
    if (!entries.length) continue;
    markets.push({ key: composite, bookmaker, marketId, name: info.n, category: info.c, entries });
  }
  const order: Record<ParsedMarket['category'], number> = { main: 0, half: 1, quarter: 2, corners: 3, specials: 4 };
  return markets.sort((a, b) => order[a.category] - order[b.category]);
}

export function parseDelta(
  raw: Record<string, unknown[]>,
  prev: Record<string, ParsedMarket> | Map<string, ParsedMarket>,
  opts?: { sportId?: string },
) {
  const all = parseOdds(raw, opts);
  const changed: string[] = [];
  const prevGet = (key: string) => (prev instanceof Map ? prev.get(key) : prev[key]);
  const delta = all.filter((m) => {
    const p = prevGet(m.key);
    if (!p) {
      changed.push(m.key);
      return true;
    }
    if (JSON.stringify(m.entries) !== JSON.stringify(p.entries)) {
      changed.push(m.key);
      return true;
    }
    return false;
  });
  return { markets: delta, changed };
}

function categoryOfParsed(market: ParsedMarket): MarketCategory {
  if (market.category === 'half') return /2-й|2nd/i.test(market.name) ? '2nd-half' : '1st-half';
  if (market.category === 'corners') return 'corners';
  if (market.category === 'quarter') return 'intervals';
  if (/тотал|total/i.test(market.name)) return 'totals';
  if (/фора|handicap/i.test(market.name)) return 'handicaps';
  if (/карт/i.test(market.name)) return 'cards';
  return 'main';
}

export function outcomeLabel(key: string, line?: string): string {
  const base = OUTCOME_LABEL[key.toLowerCase()] ?? key;
  if (!line) return base;
  if (base === 'П1') return `П1 (${line})`;
  if (base === 'П2') {
    const n = Number(line);
    const opp = Number.isFinite(n) ? (n > 0 ? `-${n}` : `+${Math.abs(n)}`) : line;
    return `П2 (${opp})`;
  }
  if (base === 'ТБ') return `ТБ ${line.replace(/^[+-]/, '')}`;
  if (base === 'ТМ') return `ТМ ${line.replace(/^[+-]/, '')}`;
  return `${base} ${line}`;
}

export function groupsFromParsedMarkets(markets: ParsedMarket[]): MarketGroup[] {
  const groups: MarketGroup[] = [];
  for (const market of markets) {
    if (market.entries.length <= 1) {
      const entry = market.entries[0];
      const outcomes = (entry?.outcomes ?? []).map((row) => ({
        label: outcomeLabel(row.key, entry?.line),
        odds: row.odds,
      }));
      if (!outcomes.length) continue;
      groups.push({
        id: market.key,
        name: [market.name, entry?.line && !/фора|тотал|угл/i.test(market.name) ? entry.line : '']
          .filter(Boolean)
          .join(' '),
        category: categoryOfParsed(market),
        layout: outcomes.length > 6 ? 'table' : 'grid',
        outcomes,
      });
      continue;
    }
    for (const entry of market.entries) {
      const outcomes = entry.outcomes.map((row) => ({
        label: outcomeLabel(row.key, entry.line),
        odds: row.odds,
      }));
      if (!outcomes.length) continue;
      groups.push({
        id: `${market.key}-${entry.id}`,
        name: [market.name, entry.line].filter(Boolean).join(' '),
        category: categoryOfParsed(market),
        layout: outcomes.length > 6 ? 'table' : 'grid',
        outcomes,
      });
    }
  }
  return groups;
}
