export interface NormalizedOdds {
  p1: number;
  x: number;
  p2: number;
  tb25: number;
  tm25: number;
  totalLine?: number;
  handicapLine?: number;
  handicapHome?: number;
  handicapAway?: number;
}

export interface ExtraMarket {
  name: string;
  outcomes: Record<string, number>;
}

export interface NormalizedMatch {
  externalId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  status: 'live' | 'upcoming' | 'finished';
  homeScore: number;
  awayScore: number;
  odds: NormalizedOdds;
  extraMarkets?: ExtraMarket[];
  country?: string;
  liveStatus?: string;
  startTime?: string;
  featured?: boolean;
  priority?: number;
  scoreReliable?: boolean;
}

export const BETSAPI_PROVIDER = 'betsapi';

export const BETSAPI_SPORTS = [
  { sportId: 1, sport: 'football' },
  { sportId: 13, sport: 'tennis' },
  { sportId: 17, sport: 'hockey' },
  { sportId: 18, sport: 'basketball' },
  { sportId: 91, sport: 'esports' },
] as const;

export type BetsApiSport = (typeof BETSAPI_SPORTS)[number]['sport'];

const COUNTRY_BY_CC: Record<string, string> = {
  ar: 'Аргентина',
  au: 'Австралия',
  br: 'Бразилия',
  cn: 'Китай',
  de: 'Германия',
  es: 'Испания',
  fr: 'Франция',
  gb: 'Англия',
  it: 'Италия',
  jp: 'Япония',
  kr: 'Корея',
  nl: 'Нидерланды',
  pt: 'Португалия',
  ru: 'Россия',
  tr: 'Турция',
  ua: 'Украина',
  us: 'США',
  uk: 'Англия',
};

const TOP_TOURNAMENTS: Array<{ re: RegExp; score: number }> = [
  { re: /world cup|чемпионат мира|euro 20|european championship|евро-20/i, score: 110 },
  { re: /uefa\s+champions|champions league|лига чемпионов|\bucl\b/i, score: 100 },
  { re: /europa league|лига европы|\buel\b/i, score: 96 },
  { re: /conference league|лига конференций/i, score: 92 },
  { re: /premier league|английск.*премьер|\bапл\b|\bepl\b/i, score: 90 },
  { re: /la\s*liga|laliga|primera division|примера/i, score: 88 },
  { re: /serie\s*a(?!\s*[b2])|серия\s*а(?!\s*[бb])/i, score: 86 },
  { re: /bundesliga|бундеслига/i, score: 84 },
  { re: /ligue\s*1|лига 1/i, score: 82 },
  { re: /\bnba\b/i, score: 80 },
  { re: /eredivisie/i, score: 72 },
  { re: /primeira liga|liga portugal/i, score: 70 },
  { re: /fa cup|copa del rey|dfb[- ]pokal|coppa italia|coupe de france/i, score: 68 },
  { re: /\batp\b|\bwta\b|grand slam|roland garros|wimbledon|us open|australian open/i, score: 74 },
];

interface BetsApiTeam {
  id?: string;
  name?: string;
  cc?: string;
}

interface BetsApiLeague {
  id?: string;
  name?: string;
  cc?: string;
}

interface BetsApiTimer {
  tm?: number | string;
  ts?: number | string;
  tt?: string;
  ta?: number | string;
  q?: string | number;
}

export interface BetsApiEvent {
  id?: string | number;
  sport_id?: string | number;
  time?: string | number;
  time_status?: string | number;
  league?: BetsApiLeague;
  home?: BetsApiTeam;
  away?: BetsApiTeam;
  ss?: string | null;
  timer?: BetsApiTimer | null;
  extra?: Record<string, unknown>;
  scores?: Record<string, { home?: string; away?: string }>;
  our_event_id?: string | number;
  our_events?: string | number;
  bet365_id?: string;
}

export interface BetsEvent {
  id: string;
  sport_id?: string;
  league: { name: string; cc?: string };
  home: { name: string; id?: string };
  away: { name: string; id?: string };
  ss?: string;
  time?: string;
  time_str?: string;
  time_status: string;
  clock_running?: boolean;
  period?: '1' | '2' | 'HT' | '';
  our_events?: string;
  start_time: string;
  bet365_id?: string;
}

export type BetsApiOddsRaw = Record<string, Array<Record<string, unknown>>>;

export function isLive(ev: BetsEvent): boolean {
  return ev.time_status === '1' || ev.our_events === '1';
}

export function isUnixClock(value?: string | number | null): boolean {
  if (value == null || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 1_000_000_000;
}

export function parseClockSeconds(value?: string | number | null): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1_000_000_000) return null;
    if (value > 200) return Math.floor(value);
    return Math.floor(value * 60);
  }
  const text = String(value).trim();
  if (!text || isUnixClock(text) || /^(ht|перерыв)$/i.test(text)) return null;
  const mmss = text.match(/(\d{1,3}):(\d{2})/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const mins = text.match(/(\d{1,3})\s*['′]/);
  if (mins) return Number(mins[1]) * 60;
  if (/^\d{1,3}$/.test(text)) return Number(text) * 60;
  return null;
}

export function formatClockSeconds(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function laterClock(a?: string, b?: string): string {
  const sa = parseClockSeconds(a);
  const sb = parseClockSeconds(b);
  if (sa == null) return b?.trim() || '';
  if (sb == null) return a?.trim() || '';
  return sb >= sa ? String(b).trim() : String(a).trim();
}

export function liveMinuteLabel(event: BetsEvent, matchTime?: string): string {
  if (event.period === 'HT') return '45:00';
  return laterClock(event.time_str, matchTime);
}

function asTimerPeriod(timer?: BetsApiTimer | null, minutes?: number): BetsEvent['period'] {
  const tt = String(timer?.tt ?? '').trim().toUpperCase();
  const tm = minutes ?? Math.floor(Number(timer?.tm) || 0);
  if (tt === 'HT' || tt === '0') return 'HT';
  if (tt === '2' || tt === '2H' || tt === '2ND') return '2';
  if (tt === '1' || tt === '1H' || tt === '1ST') return '1';
  if (tm >= 45) return '2';
  return '1';
}

function isTimerRunning(timer?: BetsApiTimer | null, timeStatus?: string | number): boolean {
  const status = String(timeStatus ?? '');
  if (status !== '1') return false;
  return asTimerPeriod(timer) !== 'HT';
}

export function resolveEventClock(raw: BetsApiEvent): {
  time_str: string;
  seconds: number;
  running: boolean;
  period: NonNullable<BetsEvent['period']>;
} {
  const timer = raw.timer;
  const period = asTimerPeriod(timer, Math.floor(Number(timer?.tm) || 0));
  if (period === 'HT') {
    return { time_str: '45:00', seconds: 45 * 60, running: false, period: 'HT' };
  }

  let minutes = Math.max(0, Math.floor(Number(timer?.tm) || 0));
  let seconds = Math.max(0, Math.floor(Number(timer?.ts) || 0));
  if (period === '2' && minutes < 45) minutes += 45;
  let total = minutes * 60 + seconds;

  const extra = raw.extra ?? {};
  const extraClock = parseClockSeconds(
    (extra.current_time as string | number | undefined) ??
      (extra.time as string | number | undefined) ??
      (extra.match_time as string | number | undefined),
  );
  if (extraClock != null) total = Math.max(total, extraClock);

  const kickoff = Number(raw.time);
  if (Number.isFinite(kickoff) && kickoff > 1_000_000_000 && String(raw.time_status) === '1') {
    const wall = Date.now() / 1000 - kickoff;
    if (period === '1') {
      total = Math.max(total, Math.min(wall, 45 * 60 + 12 * 60));
    } else if (period === '2') {
      const sinceSecondHalf = Math.max(0, wall - 45 * 60 - 15 * 60);
      total = Math.max(total, 45 * 60 + sinceSecondHalf);
    }
  }

  total = Math.min(total, 90 * 60 + 20 * 60);
  return {
    time_str: formatClockSeconds(total),
    seconds: Math.floor(total),
    running: isTimerRunning(timer, raw.time_status),
    period: period || '',
  };
}

function clockFromTimer(timer?: BetsApiTimer | null): string {
  return resolveEventClock({ timer, time_status: '1' }).time_str;
}

export function pickClockFromOdds(
  odds: BetsApiOddsRaw,
  stats?: Record<string, unknown>,
): string | undefined {
  const candidates: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && parseClockSeconds(value) != null) candidates.push(value);
    if (value && typeof value === 'object' && !Array.isArray(value) && 'tm' in value) {
      const clock = clockFromTimer(value as BetsApiTimer);
      if (clock) candidates.push(clock);
    }
  };
  if (stats) {
    push(stats.time_str);
    push(stats.current_time);
    push(stats.timer);
    push(stats.time);
    if (stats.extra && typeof stats.extra === 'object') {
      const extra = stats.extra as Record<string, unknown>;
      push(extra.current_time);
      push(extra.time);
    }
  }
  for (const rows of Object.values(odds)) {
    for (const row of rows) {
      push(row.time_str);
      push(row.time);
    }
  }
  let best: string | undefined;
  let bestSec = -1;
  for (const clock of candidates) {
    const sec = parseClockSeconds(clock);
    if (sec != null && sec >= bestSec) {
      best = formatClockSeconds(sec);
      bestSec = sec;
    }
  }
  return best;
}

export function toBetsEvent(raw: BetsApiEvent): BetsEvent {
  const clock = resolveEventClock(raw);
  return {
    id: String(raw.id ?? ''),
    sport_id: raw.sport_id != null ? String(raw.sport_id) : undefined,
    league: { name: raw.league?.name || 'League', cc: raw.league?.cc },
    home: { name: raw.home?.name || 'Home', id: raw.home?.id },
    away: { name: raw.away?.name || 'Away', id: raw.away?.id },
    ss: raw.ss || undefined,
    time: raw.time != null ? String(raw.time) : undefined,
    time_str: clock.time_str || undefined,
    time_status: String(raw.time_status ?? '0'),
    clock_running: clock.running,
    period: clock.period,
    our_events: raw.our_events != null ? String(raw.our_events) : raw.our_event_id != null ? String(raw.our_event_id) : undefined,
    start_time: String(raw.time ?? ''),
    bet365_id: raw.bet365_id,
  };
}

interface OddsRow {
  home_od?: string | number;
  draw_od?: string | number;
  away_od?: string | number;
  over_od?: string | number;
  under_od?: string | number;
  handicap?: string | number;
  add_time?: string | number;
  [key: string]: unknown;
}

interface OddsPayload {
  odds?: Record<string, unknown>;
}

const MARKET_TITLE_BY_KEY: Record<string, string> = {
  '1_1': '1X2',
  '1_2': 'Фора',
  '1_3': 'Тотал',
  '1_4': 'Угловые',
  '1_5': '1-й тайм. Фора',
  '1_6': '1-й тайм. Тотал',
  '1_7': '1-й тайм. Угловые',
  '1_8': '1-й тайм. Исход',
  '18_1': 'Победитель',
  '18_2': 'Фора',
  '18_3': 'Тотал',
  '18_4': 'Победитель (тайм)',
  '18_5': 'Фора (тайм)',
  '18_6': 'Тотал (тайм)',
  '18_7': 'Четверть. Победитель',
  '18_8': 'Четверть. Фора',
  '18_9': 'Четверть. Тотал',
  '3_4': 'Ничья — ставка недействительна',
};

const MARKET_TITLE_BY_ID: Record<string, string> = {
  '1': '1X2',
  '2': 'Фора',
  '3': 'Тотал',
  '4': 'Угловые',
};

const MARKET_TITLE_ALIASES: Array<{ test: RegExp; title: string }> = [
  { test: /both teams to score|^btts$|обе забьют/i, title: 'Обе забьют' },
  { test: /double chance|двойной шанс/i, title: 'Двойной шанс' },
  { test: /full.?time result|^1x2$|match result|исход матча/i, title: '1X2' },
  { test: /match winner|money ?line|to win|победитель/i, title: 'Победитель' },
  { test: /asian handicap|handicap|spread|^ah\b|фора/i, title: 'Фора' },
  { test: /goal line|over\/under|totals?|тотал/i, title: 'Тотал' },
  { test: /corner|угл/i, title: 'Угловые' },
  { test: /correct score|точный счёт/i, title: 'Точный счёт' },
  { test: /draw no bet|ничья — ставка/i, title: 'Ничья — ставка недействительна' },
  { test: /half time result|1st half result|1-й тайм.*исход/i, title: '1-й тайм. Исход' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function asOddValue(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) && value > 1 ? value : 0;
  const text = asText(value).replace(',', '.');
  if (!text) return 0;
  if (text.includes('/')) {
    const [left, right] = text.split('/');
    const num = Number(left);
    const den = Number(right);
    if (den) return Math.round((1 + num / den) * 100) / 100;
  }
  const n = Number(text);
  return Number.isFinite(n) && n > 1 ? n : 0;
}

function formatLine(value: unknown): string {
  const text = asText(value);
  if (!text) return '';
  const n = Number(text);
  if (!Number.isFinite(n)) return text;
  if (n > 0) return `+${n}`;
  return String(n);
}

function oppositeLine(line: string): string {
  if (!line || line === '0') return '0';
  if (line.startsWith('+')) return `-${line.slice(1)}`;
  if (line.startsWith('-')) return `+${line.slice(1)}`;
  return `-${line}`;
}

function translateMarketTitle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const byKey = MARKET_TITLE_BY_KEY[trimmed];
  if (byKey) return byKey;
  const parts = trimmed.split('_');
  if (parts.length >= 2) {
    const byFull = MARKET_TITLE_BY_KEY[`${parts[0]}_${parts[1]}`];
    if (byFull) return byFull;
    const byId = MARKET_TITLE_BY_ID[parts[1]];
    if (byId && parts[0] !== '1' && parts[0] !== '18') return byId;
    if (byId && (parts[0] === '1' || parts[0] === '18')) {
      /* sport-specific keys already handled above */
    }
  }
  for (const row of MARKET_TITLE_ALIASES) {
    if (row.test.test(trimmed)) return row.title;
  }
  return trimmed;
}

function rowTitle(row: Record<string, unknown>): string {
  return (
    asText(row.market_name) ||
    asText(row.header) ||
    asText(row.name) ||
    asText(row.NA) ||
    asText(row.na) ||
    asText(row.title) ||
    asText(row.label) ||
    ''
  );
}

function rowHandicap(row: Record<string, unknown>): string {
  return formatLine(row.handicap ?? row.ha ?? row.HA ?? row.hd ?? row.HD ?? row.val ?? row.line);
}

function looksLikeOddsRow(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.some((key) =>
    /(_od$|^od$|^OD$|^odd$|^odds$|^price$|^home_od$|^away_od$|^over_od$|^under_od$)/.test(key),
  );
}

function outcomesFromRow(row: Record<string, unknown>): Record<string, number> {
  const outcomes: Record<string, number> = {};
  const line = rowHandicap(row);
  const named = rowTitle(row);
  const used = new Set<string>();

  const add = (label: string, raw: unknown) => {
    const odd = asOddValue(raw);
    if (!odd || !label) return;
    const key = outcomes[label] ? `${label} · ${odd}` : label;
    outcomes[key] = odd;
  };

  if (row.home_od != null) {
    add(line ? `П1 (${line})` : 'П1', row.home_od);
    used.add('home_od');
  }
  if (row.draw_od != null) {
    add('X', row.draw_od);
    used.add('draw_od');
  }
  if (row.away_od != null) {
    add(line ? `П2 (${oppositeLine(line)})` : 'П2', row.away_od);
    used.add('away_od');
  }
  if (row.over_od != null) {
    add(line ? `ТБ ${line.replace(/^[+-]/, '')}` : named || 'ТБ', row.over_od);
    used.add('over_od');
  }
  if (row.under_od != null) {
    add(line ? `ТМ ${line.replace(/^[+-]/, '')}` : named || 'ТМ', row.under_od);
    used.add('under_od');
  }

  for (const [key, value] of Object.entries(row)) {
    if (used.has(key)) continue;
    if (key === 'odd' || key === 'odds' || key === 'price' || key === 'od' || key === 'OD' || key.endsWith('_od')) {
      const label = named || (line ? `${translateMarketTitle(key)} (${line})` : translateMarketTitle(key.replace(/_od$/, '')));
      add(label, value);
    }
  }
  return outcomes;
}

function latestByLine(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const byLine = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const line = `${rowHandicap(row)}|${rowTitle(row)}`;
    const prev = byLine.get(line);
    if (!prev || toNum(row.add_time) >= toNum(prev.add_time)) byLine.set(line, row);
  }
  return [...byLine.values()];
}

function marketFromRows(key: string, rows: unknown[]): ExtraMarket | null {
  const records = rows.filter(isRecord);
  if (!records.length) return null;
  const named = records.map(rowTitle).find(Boolean) ?? '';
  const title = translateMarketTitle(named || key);
  const outcomes: Record<string, number> = {};
  for (const row of latestByLine(records)) {
    Object.assign(outcomes, outcomesFromRow(row));
  }
  if (!Object.keys(outcomes).length) return null;
  return { name: title, outcomes };
}

function parseBet365Groups(payload: unknown): ExtraMarket[] {
  const nodes: Record<string, unknown>[] = [];
  const walk = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!isRecord(value)) return;
    if (asText(value.type)) nodes.push(value);
    for (const nested of Object.values(value)) walk(nested);
  };
  walk(payload);

  const markets: ExtraMarket[] = [];
  let current: ExtraMarket | null = null;
  const flush = () => {
    if (current && Object.keys(current.outcomes).length) markets.push(current);
    current = null;
  };

  for (const node of nodes) {
    const type = asText(node.type).toUpperCase();
    if (type === 'MG') {
      flush();
      const title = translateMarketTitle(asText(node.NA) || asText(node.na) || 'Маркет');
      current = { name: title, outcomes: {} };
      continue;
    }
    if (type === 'PA' && current) {
      const label = [asText(node.NA) || asText(node.na) || asText(node.header), rowHandicap(node)].filter(Boolean).join(' ');
      const odd = asOddValue(node.OD ?? node.od ?? node.odd ?? node.odds ?? node.price);
      if (label && odd) current.outcomes[label] = odd;
    }
  }
  flush();
  return markets;
}

export function parseAllMarketsFromOdds(raw: unknown): ExtraMarket[] {
  const collected: ExtraMarket[] = [];
  const seen = new Set<unknown>();

  const visit = (value: unknown, path: string) => {
    if (value == null || seen.has(value)) return;
    if (typeof value === 'object') seen.add(value);

    if (Array.isArray(value)) {
      if (value.some(looksLikeOddsRow) || value.some(isRecord)) {
        const market = marketFromRows(path || 'market', value);
        if (market) collected.push(market);
      }
      const nestedTrees = value.filter((item) => isRecord(item) && asText(item.type));
      if (nestedTrees.length) collected.push(...parseBet365Groups(value));
      for (const item of value) {
        if (!looksLikeOddsRow(item)) visit(item, path);
      }
      return;
    }

    if (!isRecord(value)) return;

    if (asText(value.type) === 'MG' || asText(value.type) === 'PA') {
      collected.push(...parseBet365Groups(value));
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      if (key === 'odds' || key === 'results' || key === 'markets' || key === 'extra') {
        visit(nested, path);
        continue;
      }
      visit(nested, key);
    }
  };

  visit(raw, '');

  const unique = new Map<string, ExtraMarket>();
  for (const market of collected) {
    const prev = unique.get(market.name);
    if (!prev) {
      unique.set(market.name, { name: market.name, outcomes: { ...market.outcomes } });
      continue;
    }
    prev.outcomes = { ...prev.outcomes, ...market.outcomes };
  }
  return [...unique.values()].filter((market) => Object.keys(market.outcomes).length > 0);
}

function readEnv(name: string): string {
  const vite = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[name];
  if (vite) return vite;
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name] ?? '';
}

export function getBetsApiToken(): string {
  return readEnv('BETSAPI_TOKEN') || readEnv('VITE_BETSAPI_TOKEN');
}

const MIN_REQUEST_GAP_MS = 1800;
const BACKOFF_START_MS = 10_000;
const BACKOFF_MAX_MS = 120_000;

export class BetsApiRateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`BetsAPI 429: pause ${Math.round(retryAfterMs / 1000)}s`);
    this.name = 'BetsApiRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

let queue: Promise<void> = Promise.resolve();
let nextSlotAt = 0;
let backoffUntil = 0;
let backoffMs = BACKOFF_START_MS;

export function betsApiPauseRemaining(): number {
  return Math.max(0, backoffUntil - Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

async function enqueueBetsApi<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = Math.max(0, Math.max(nextSlotAt, backoffUntil) - Date.now());
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      nextSlotAt = Date.now() + MIN_REQUEST_GAP_MS;
    }
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function betsapiGetDirect<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const wait = Math.max(0, backoffUntil - Date.now());
  if (wait > 0) await sleep(wait);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }

  let url: string;
  if (isBrowser()) {
    const query = search.toString();
    url = `/api/betsapi${path}${query ? `?${query}` : ''}`;
  } else {
    const token = getBetsApiToken();
    if (!token) throw new Error('BetsAPI token is missing');
    search.set('token', token);
    url = `https://api.betsapi.com${path}?${search.toString()}`;
  }

  const response = await fetch(url, { signal });
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after'));
    const pause = Math.max(BACKOFF_START_MS, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs);
    backoffMs = Math.min(Math.max(pause, backoffMs) * 2, BACKOFF_MAX_MS);
    backoffUntil = Date.now() + pause;
    throw new BetsApiRateLimitError(pause);
  }
  if (!response.ok) throw new Error(`BetsAPI HTTP ${response.status}`);
  const json = (await response.json()) as { success?: number; error?: string } & T;
  if (json && (json.success === 1 || (json as { results?: unknown }).results)) {
    backoffMs = BACKOFF_START_MS;
    return json;
  }
  throw new Error(json.error || 'BetsAPI returned success=0');
}

async function betsapiGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  signal?: AbortSignal,
): Promise<T> {
  return enqueueBetsApi(async () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === '') continue;
      search.set(key, String(value));
    }

    let url: string;
    if (isBrowser()) {
      const query = search.toString();
      url = `/api/betsapi${path}${query ? `?${query}` : ''}`;
    } else {
      const token = getBetsApiToken();
      if (!token) throw new Error('BetsAPI token is missing');
      search.set('token', token);
      url = `https://api.betsapi.com${path}?${search.toString()}`;
    }

    const response = await fetch(url, { signal });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const pause = Math.max(BACKOFF_START_MS, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs);
      backoffMs = Math.min(Math.max(pause, backoffMs) * 2, BACKOFF_MAX_MS);
      backoffUntil = Date.now() + pause;
      throw new BetsApiRateLimitError(pause);
    }
    if (!response.ok) {
      throw new Error(`BetsAPI HTTP ${response.status}`);
    }

    const json = (await response.json()) as { success?: number; error?: string } & T;
    if (json && (json.success === 1 || (json as { results?: unknown }).results)) {
      backoffMs = BACKOFF_START_MS;
      return json;
    }
    throw new Error(json.error || 'BetsAPI returned success=0');
  });
}

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function emptyOdds(odds: NormalizedOdds | undefined): boolean {
  if (!odds) return true;
  return !odds.p1 && !odds.p2 && !odds.tb25 && !odds.tm25;
}

function mergeOdds(base: NormalizedOdds | undefined, next: NormalizedOdds | undefined): NormalizedOdds {
  const a = base ?? { p1: 0, x: 0, p2: 0, tb25: 0, tm25: 0 };
  const b = next ?? { p1: 0, x: 0, p2: 0, tb25: 0, tm25: 0 };
  return {
    p1: b.p1 || a.p1,
    x: b.x || a.x,
    p2: b.p2 || a.p2,
    tb25: b.tb25 || a.tb25,
    tm25: b.tm25 || a.tm25,
    totalLine: b.totalLine || a.totalLine,
    handicapLine: b.handicapLine ?? a.handicapLine,
    handicapHome: b.handicapHome || a.handicapHome,
    handicapAway: b.handicapAway || a.handicapAway,
  };
}

function mergeExtra(base: ExtraMarket[] | undefined, next: ExtraMarket[] | undefined): ExtraMarket[] {
  const byName = new Map<string, ExtraMarket>();
  for (const market of [...(base ?? []), ...(next ?? [])]) {
    const prev = byName.get(market.name);
    byName.set(market.name, {
      name: market.name,
      outcomes: { ...(prev?.outcomes ?? {}), ...market.outcomes },
    });
  }
  return [...byName.values()].filter((market) => Object.values(market.outcomes).some((value) => value > 0));
}

export function tournamentPriority(league: string | undefined, sport = 'football'): number {
  const name = league ?? '';
  for (const row of TOP_TOURNAMENTS) {
    if (row.re.test(name)) return row.score;
  }
  if (sport === 'football') return 20;
  if (sport === 'basketball') return 12;
  if (sport === 'tennis') return 10;
  return 5;
}

export function isTopTournament(league: string | undefined, sport = 'football'): boolean {
  return tournamentPriority(league, sport) >= 80;
}

export async function fetchInplayEvents(sportId: number): Promise<BetsApiEvent[]> {
  const json = await betsapiGet<{ results?: BetsApiEvent[] }>('/v3/events/inplay', { sport_id: sportId });
  return json.results ?? [];
}

export async function fetchUpcomingEvents(sportId: number, page = 1): Promise<BetsApiEvent[]> {
  const json = await betsapiGet<{ results?: BetsApiEvent[] }>('/v3/events/upcoming', {
    sport_id: sportId,
    page,
  });
  return json.results ?? [];
}

export async function fetchInplay(sportId = '1', _page = 1, signal?: AbortSignal): Promise<BetsEvent[]> {
  const json = await betsapiGet<{ results?: BetsApiEvent[] }>(
    '/v3/events/inplay',
    { sport_id: sportId },
    signal,
  );
  return (json.results ?? []).map(toBetsEvent).filter((ev) => ev.time_status === '1' || ev.our_events === '1');
}

export async function fetchUpcoming(sportId = '1', page = 1, _hours = 48, signal?: AbortSignal): Promise<BetsEvent[]> {
  const json = await betsapiGet<{ results?: BetsApiEvent[] }>(
    '/v3/events/upcoming',
    { sport_id: sportId, page },
    signal,
  );
  return (json.results ?? []).map(toBetsEvent).filter((ev) => ev.time_status === '0');
}

export async function fetchEventOdds(
  eventId: string,
  sinceTime?: number,
  signal?: AbortSignal,
): Promise<{ odds: BetsApiOddsRaw; stats: Record<string, unknown> | undefined; clock?: string }> {
  const json = await betsapiGetDirect<{ results?: { odds?: unknown; stats?: Record<string, unknown> } }>(
    '/v2/event/odds',
    {
      event_id: eventId,
      source: 'bet365',
      since_time: sinceTime,
    },
    signal,
  );
  const raw = json.results?.odds;
  const odds: BetsApiOddsRaw = {};
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(value)) odds[key] = value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');
    }
  }
  const stats = json.results?.stats;
  return { odds, stats, clock: pickClockFromOdds(odds, stats) };
}

export async function fetchEndedEvents(sportId: number, day: string, page = 1): Promise<BetsApiEvent[]> {
  const json = await betsapiGet<{ results?: BetsApiEvent[] }>('/v3/events/ended', {
    sport_id: sportId,
    day,
    page,
  });
  return json.results ?? [];
}

function firstViewEvent(results: unknown): BetsApiEvent | null {
  if (!results) return null;
  if (Array.isArray(results)) return (results[0] as BetsApiEvent | undefined) ?? null;
  if (typeof results === 'object' && results && ('id' in results || 'ss' in results || 'timer' in results)) {
    return results as BetsApiEvent;
  }
  return null;
}

export async function fetchEventView(eventId: string): Promise<BetsApiEvent | null> {
  const json = await betsapiGet<{ results?: unknown }>('/v1/event/view', { event_id: eventId });
  return firstViewEvent(json.results);
}

export interface LiveEventSnapshot {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  homeScore: number;
  awayScore: number;
  period: string;
  clock: string;
  liveStatus: string;
  isLive: boolean;
  clockRunning: boolean;
  sport: string;
  odds: NormalizedOdds;
  extraMarkets: ExtraMarket[];
}

const ODDS_CACHE_TTL_MS = 90_000;
const oddsCache = new Map<string, { odds: NormalizedOdds; extra: ExtraMarket[]; at: number }>();
const liveSnapshots = new Map<string, LiveEventSnapshot>();
let oddsRotate = 0;

export function getCachedLiveSnapshot(eventId: string): LiveEventSnapshot | null {
  if (!eventId) return null;
  return liveSnapshots.get(eventId) ?? null;
}

function rememberLiveSnapshot(snapshot: LiveEventSnapshot): void {
  if (!snapshot.eventId) return;
  liveSnapshots.set(snapshot.eventId, snapshot);
}

function attachCachedOdds(match: NormalizedMatch): void {
  const cached = oddsCache.get(match.externalId);
  if (!cached) return;
  match.odds = mergeOdds(match.odds, cached.odds);
  match.extraMarkets = mergeExtra(match.extraMarkets, cached.extra);
}

function rememberOdds(eventId: string, odds: NormalizedOdds, extra: ExtraMarket[]): void {
  oddsCache.set(eventId, { odds, extra, at: Date.now() });
}

function dcFrom1x2(odds: NormalizedOdds): ExtraMarket | null {
  if (!odds.p1 || !odds.x || !odds.p2) return null;
  const combo = (a: number, b: number) => {
    const implied = 1 / a + 1 / b;
    return implied > 0 ? Math.round((1 / implied) * 100) / 100 : 0;
  };
  const oneX = combo(odds.p1, odds.x);
  const twelve = combo(odds.p1, odds.p2);
  const x2 = combo(odds.x, odds.p2);
  if (!oneX || !twelve || !x2) return null;
  return { name: 'Двойной шанс', outcomes: { '1X': oneX, '12': twelve, X2: x2 } };
}

async function enrichMatchOdds(matches: NormalizedMatch[], sportId: number): Promise<void> {
  for (const match of matches) attachCachedOdds(match);
  if (betsApiPauseRemaining() > 0 || !matches.length) return;

  const now = Date.now();
  const need = matches.filter((match) => {
    const cached = oddsCache.get(match.externalId);
    const stale = !cached || now - cached.at > ODDS_CACHE_TTL_MS;
    return stale && (emptyOdds(match.odds) || Boolean(match.featured) || (match.priority ?? 0) >= 80);
  });
  const ranked = [
    ...need.filter((match) => match.featured),
    ...need.filter((match) => !match.featured),
  ];
  if (!ranked.length) return;

  const pick = ranked[oddsRotate % ranked.length];
  oddsRotate += 1;
  try {
    const bundle = await fetchEventOddsBundle(pick.externalId, sportId);
    const dc = dcFrom1x2(bundle.odds);
    const extra = mergeExtra(bundle.extra, dc ? [dc] : []);
    rememberOdds(pick.externalId, bundle.odds, extra);
    pick.odds = mergeOdds(pick.odds, bundle.odds);
    pick.extraMarkets = mergeExtra(pick.extraMarkets, extra);
  } catch (err) {
    if (err instanceof BetsApiRateLimitError) return;
    console.error(`Odds ${pick.externalId} failed:`, err);
  }
}

function oddsDictFromPacket(oddsMap: unknown): Record<string, OddsRow[] | undefined> | null {
  if (!oddsMap || typeof oddsMap !== 'object') return null;
  const root = isRecord(oddsMap) && isRecord(oddsMap.odds) ? oddsMap.odds : (oddsMap as Record<string, unknown>);
  const dict: Record<string, OddsRow[] | undefined> = {};
  for (const [key, value] of Object.entries(root)) {
    if (Array.isArray(value)) dict[key] = value.filter(isRecord);
  }
  return Object.keys(dict).length ? dict : null;
}

export function liveSnapshotFromPacket(viewRaw: unknown, oddsMap?: unknown): LiveEventSnapshot | null {
  const view = firstViewEvent(viewRaw) ?? (viewRaw && typeof viewRaw === 'object' && ('ss' in viewRaw || 'timer' in viewRaw)
    ? (viewRaw as BetsApiEvent)
    : null);
  if (!view) return null;
  const sportId = Number(view.sport_id ?? 1);
  const sport = sportById(sportId);
  const score = parseScore(view);
  const timer = formatMatchTimer(view.timer, sport, view.time_status);
  let odds: NormalizedOdds = { p1: 0, x: 0, p2: 0, tb25: 0, tm25: 0 };
  let extraMarkets: ExtraMarket[] = [];
  const eventId = String(view.id ?? '');
  const cached = eventId ? oddsCache.get(eventId) : undefined;
  if (cached) {
    odds = cached.odds;
    extraMarkets = cached.extra;
  }
  const dict = oddsDictFromPacket(oddsMap);
  if (dict || oddsMap != null) {
    const parsed = dict ? parseOdds(dict, sportId) : odds;
    const extra = parseAllMarketsFromOdds(oddsMap ?? dict);
    const dc = dcFrom1x2(parsed);
    const merged = extra.some((market) => /двойной шанс/i.test(market.name))
      ? extra
      : mergeExtra(extra, dc ? [dc] : []);
    if (eventId) rememberOdds(eventId, parsed, merged);
    odds = parsed;
    extraMarkets = merged;
  }
  const snapshot: LiveEventSnapshot = {
    eventId,
    homeTeam: view.home?.name?.trim() ?? '',
    awayTeam: view.away?.name?.trim() ?? '',
    league: view.league?.name?.trim() ?? '',
    homeScore: score.home,
    awayScore: score.away,
    period: timer.period,
    clock: timer.clock,
    liveStatus: timer.liveStatus || formatLiveStatus(view, sport),
    isLive: statusFromTime(view.time_status) === 'live',
    clockRunning: clockIsRunning(view.timer, view.time_status, sport),
    sport,
    odds,
    extraMarkets,
  };
  rememberLiveSnapshot(snapshot);
  return snapshot;
}

export function tickLiveSnapshotClock(snapshot: LiveEventSnapshot): LiveEventSnapshot {
  if (!snapshot.clockRunning) return snapshot;
  const parts = snapshot.clock.split(':');
  if (parts.length < 2) return snapshot;
  let minutes = Number(parts[0]);
  let seconds = Number(parts[1]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return snapshot;
  seconds += 1;
  if (seconds >= 60) {
    seconds = 0;
    minutes += 1;
  }
  const clockText = `${String(Math.max(0, minutes)).padStart(2, '0')}:${String(Math.max(0, seconds)).padStart(2, '0')}`;
  return {
    ...snapshot,
    clock: clockText,
    liveStatus: [snapshot.period, clockText].filter(Boolean).join(' '),
  };
}

export async function fetchLiveEventSnapshot(eventId: string): Promise<LiveEventSnapshot | null> {
  if (betsApiPauseRemaining() > 0) return null;
  const view = await fetchEventView(eventId);
  if (!view) return null;
  let oddsMap: unknown;
  try {
    if (betsApiPauseRemaining() === 0) {
      const json = await betsapiGet<{ results?: OddsPayload }>('/v2/event/odds', {
        event_id: eventId,
      });
      oddsMap = json.results?.odds ?? json.results;
    }
  } catch (err) {
    if (!(err instanceof BetsApiRateLimitError)) {
      console.error(`Live odds for ${eventId} failed:`, err);
    }
  }
  return liveSnapshotFromPacket(view, oddsMap);
}

export async function fetchEventOddsBundle(eventId: string, sportId: number): Promise<{ odds: NormalizedOdds; extra: ExtraMarket[] }> {
  const json = await betsapiGet<{ results?: OddsPayload | unknown }>('/v2/event/odds', {
    event_id: eventId,
  });
  const raw = json.results ?? {};
  const dict = oddsDictFromPacket(raw) ?? {};
  const extra = parseAllMarketsFromOdds(raw);
  const parsed = parseOdds(dict, sportId);
  const dc = dcFrom1x2(parsed);
  return {
    odds: parsed,
    extra: extra.some((market) => /двойной шанс/i.test(market.name)) ? extra : mergeExtra(extra, dc ? [dc] : []),
  };
}

function latestRow(rows: OddsRow[] | undefined): OddsRow | undefined {
  if (!rows?.length) return undefined;
  return rows.reduce((best, row) => (toNum(row.add_time) >= toNum(best.add_time) ? row : best));
}

function currentLines(rows: OddsRow[] | undefined): OddsRow[] {
  if (!rows?.length) return [];
  const newest = Math.max(...rows.map((row) => toNum(row.add_time)));
  const sameTick = newest > 0 ? rows.filter((row) => toNum(row.add_time) === newest) : rows;
  return sameTick.length ? sameTick : rows.slice(-8);
}

function pickTotal(rows: OddsRow[] | undefined, sport: string): OddsRow | undefined {
  const lines = currentLines(rows);
  if (!lines.length) return latestRow(rows);
  if (sport === 'football') {
    return [...lines].sort((a, b) => Math.abs(toNum(a.handicap) - 2.5) - Math.abs(toNum(b.handicap) - 2.5))[0];
  }
  return [...lines].sort((a, b) => Math.abs(toNum(a.over_od) - toNum(a.under_od)) - Math.abs(toNum(b.over_od) - toNum(b.under_od)))[0];
}

function pickHandicap(rows: OddsRow[] | undefined): OddsRow | undefined {
  const lines = currentLines(rows);
  if (!lines.length) return latestRow(rows);
  return [...lines].sort((a, b) => Math.abs(toNum(a.handicap)) - Math.abs(toNum(b.handicap)))[0];
}

function marketRows(odds: Record<string, OddsRow[] | undefined>, sportId: number, market: number): OddsRow[] | undefined {
  return odds[`${sportId}_${market}`] ?? odds[`1_${market}`] ?? odds[`18_${market}`];
}

export function parseOdds(odds: Record<string, OddsRow[] | undefined>, sportId: number): NormalizedOdds {
  const sport = BETSAPI_SPORTS.find((row) => row.sportId === sportId)?.sport ?? 'football';
  const moneyline = latestRow(marketRows(odds, sportId, 1));
  const totals = pickTotal(marketRows(odds, sportId, 3), sport);
  const handicap = pickHandicap(marketRows(odds, sportId, 2));
  const totalLine = toNum(totals?.handicap) || (sport === 'football' ? 2.5 : 0);
  return {
    p1: toNum(moneyline?.home_od),
    x: toNum(moneyline?.draw_od),
    p2: toNum(moneyline?.away_od),
    tb25: toNum(totals?.over_od),
    tm25: toNum(totals?.under_od),
    totalLine,
    handicapLine: handicap ? toNum(handicap.handicap) : undefined,
    handicapHome: handicap ? toNum(handicap.home_od) : undefined,
    handicapAway: handicap ? toNum(handicap.away_od) : undefined,
  };
}

export function parseSsScore(ss?: string | null): { home: number; away: number } | null {
  if (!ss) return null;
  const chunk = String(ss).split(',')[0]?.trim() ?? '';
  const match = chunk.match(/^(\d+)\s*[-:]\s*(\d+)/);
  if (!match) return null;
  return { home: Number(match[1]), away: Number(match[2]) };
}

function parseScore(event: BetsApiEvent): { home: number; away: number; reliable: boolean } {
  const fromSs = parseSsScore(event.ss);
  if (fromSs) return { ...fromSs, reliable: true };
  const periods = Object.values(event.scores ?? {});
  if (periods.length) {
    const last = periods[periods.length - 1];
    return { home: toNum(last?.home), away: toNum(last?.away), reliable: true };
  }
  return { home: 0, away: 0, reliable: false };
}

export function formatMatchTimer(
  timer: BetsApiTimer | null | undefined,
  sport = 'football',
  timeStatus?: string | number,
): { period: string; clock: string; liveStatus: string } {
  const hasClock =
    timer != null &&
    ((timer.tm != null && String(timer.tm) !== '') || (timer.ts != null && String(timer.ts) !== ''));
  const minutes = Math.floor(toNum(timer?.tm));
  const seconds = Math.floor(toNum(timer?.ts));
  const clockText = hasClock ? clock(minutes, seconds) : '';
  const ttRaw = String(timer?.tt ?? '').trim();
  const tt = ttRaw.toUpperCase();
  const status = statusFromTime(timeStatus);

  if (status === 'finished') return { period: 'Завершён', clock: clockText, liveStatus: 'Завершён' };

  if (sport === 'basketball') {
    const quarter = timer?.q ?? (hasClock ? Math.min(4, Math.floor(minutes / 12) + 1) : '');
    const period = quarter ? `${quarter}-я четверть` : 'LIVE';
    const qClock = hasClock ? clock(minutes % 12, seconds) : '';
    return { period, clock: qClock, liveStatus: [period, qClock].filter(Boolean).join(' ') };
  }
  if (sport === 'tennis') {
    return { period: 'LIVE', clock: clockText, liveStatus: clockText || 'LIVE' };
  }
  if (sport === 'esports') {
    return { period: 'LIVE', clock: clockText, liveStatus: clockText || 'LIVE' };
  }

  let period = '';
  if (tt === 'HT' || tt === '0') period = 'Перерыв';
  else if (tt === '2') period = '2-й тайм';
  else if (tt === '1') period = '1-й тайм';
  else if (status === 'live' && hasClock) period = minutes >= 45 ? '2-й тайм' : '1-й тайм';
  else if (status === 'live') period = 'LIVE';

  const liveStatus = [period, clockText].filter(Boolean).join(' ');
  return { period, clock: clockText, liveStatus };
}

export function parseLiveClock(status?: string | null): { period: string; clock: string } {
  if (!status) return { period: '', clock: '' };
  const known = status.match(/^(1-й тайм|2-й тайм|Перерыв)\s+(\d{1,2}:\d{2})/i);
  if (known) return { period: known[1], clock: known[2] };
  const clockOnly = status.match(/(\d{1,2}:\d{2})/);
  if (clockOnly) {
    return {
      period: status.replace(clockOnly[1], '').replace(/[,]/g, '').replace(/^прошло\s+/i, '').trim(),
      clock: clockOnly[1],
    };
  }
  const parts = status.split(',');
  return {
    period: parts[0]?.trim() ?? '',
    clock: parts.slice(1).join(',').trim().replace(/^прошло\s+/i, ''),
  };
}

function statusFromTime(timeStatus: string | number | undefined): NormalizedMatch['status'] {
  const value = Number(timeStatus);
  if (value === 1) return 'live';
  if (value === 3 || value === 4 || value === 5 || value === 6 || value === 8 || value === 9 || value === 99) {
    return 'finished';
  }
  return 'upcoming';
}

function clockIsRunning(
  timer: BetsApiTimer | null | undefined,
  timeStatus: string | number | undefined,
  sport: string,
): boolean {
  if (statusFromTime(timeStatus) !== 'live') return false;
  if (sport === 'tennis' || sport === 'esports') return false;
  const tt = String(timer?.tt ?? '').trim().toUpperCase();
  if (tt === '0' || tt === 'HT') return false;
  return tt === '1' || tt === '2' || tt === '';
}

function clock(tm: number, ts: number): string {
  return `${String(Math.max(0, tm)).padStart(2, '0')}:${String(Math.max(0, ts)).padStart(2, '0')}`;
}

function formatLiveStatus(event: BetsApiEvent, sport: string): string {
  if (sport === 'tennis' && event.ss) return `Счёт ${event.ss}`;
  return formatMatchTimer(event.timer, sport, event.time_status).liveStatus;
}

function countryOf(event: BetsApiEvent): string {
  const cc = (event.league?.cc || event.home?.cc || '').toLowerCase();
  if (cc && COUNTRY_BY_CC[cc]) return COUNTRY_BY_CC[cc];
  return cc ? cc.toUpperCase() : '';
}

function sportById(sportId: number): string {
  return BETSAPI_SPORTS.find((row) => row.sportId === sportId)?.sport ?? 'football';
}

export function mapBetsApiEvent(
  event: BetsApiEvent,
  odds?: NormalizedOdds,
  extraMarkets?: ExtraMarket[],
): NormalizedMatch | null {
  const id = String(event.id ?? '');
  const home = event.home?.name?.trim() ?? '';
  const away = event.away?.name?.trim() ?? '';
  if (!id || !home || !away) return null;
  const sportId = Number(event.sport_id ?? 1);
  const sport = sportById(sportId);
  const score = parseScore(event);
  const startUnix = toNum(event.time);
  const league = event.league?.name || 'Турнир';
  const priority = tournamentPriority(league, sport);
  return {
    externalId: id,
    sport,
    league,
    country: countryOf(event),
    homeTeam: home,
    awayTeam: away,
    status: statusFromTime(event.time_status),
    homeScore: score.home,
    awayScore: score.away,
    scoreReliable: score.reliable,
    liveStatus: formatLiveStatus(event, sport),
    startTime: startUnix ? new Date(startUnix * 1000).toISOString() : undefined,
    odds: odds ?? { p1: 0, x: 0, p2: 0, tb25: 0, tm25: 0 },
    extraMarkets,
    featured: priority >= 80,
    priority,
  };
}

export function yyyymmdd(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}


let liveSportCursor = 0;
let upcomingSportCursor = 0;
let endedSportCursor = 0;

export async function fetchBetsApiLiveFeed(): Promise<NormalizedMatch[]> {
  const row = BETSAPI_SPORTS[liveSportCursor % BETSAPI_SPORTS.length];
  liveSportCursor += 1;
  const events = await fetchInplayEvents(row.sportId);
  const mapped = events
    .map((event) => mapBetsApiEvent(event))
    .filter((match): match is NormalizedMatch => Boolean(match));
  await enrichMatchOdds(mapped, row.sportId);
  return mapped;
}

export async function fetchBetsApiUpcomingFeed(perSport = 24): Promise<NormalizedMatch[]> {
  const row = BETSAPI_SPORTS[upcomingSportCursor % BETSAPI_SPORTS.length];
  upcomingSportCursor += 1;
  const events = (await fetchUpcomingEvents(row.sportId, 1))
    .sort((a, b) => tournamentPriority(b.league?.name, row.sport) - tournamentPriority(a.league?.name, row.sport))
    .slice(0, perSport);
  const mapped = events
    .map((event) => mapBetsApiEvent(event))
    .filter((match): match is NormalizedMatch => Boolean(match));
  await enrichMatchOdds(mapped, row.sportId);
  return mapped;
}

export async function fetchBetsApiEndedFeed(): Promise<NormalizedMatch[]> {
  const row = BETSAPI_SPORTS[endedSportCursor % BETSAPI_SPORTS.length];
  endedSportCursor += 1;
  const events = await fetchEndedEvents(row.sportId, yyyymmdd(), 1);
  return events
    .slice(0, 40)
    .map((event) => mapBetsApiEvent(event))
    .filter((match): match is NormalizedMatch => Boolean(match));
}
