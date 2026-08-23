import {
  BetsApiRateLimitError,
  betsApiPauseRemaining,
  fetchBetsApiEndedFeed,
  fetchBetsApiLiveFeed,
  fetchBetsApiUpcomingFeed,
  getBetsApiToken,
  type NormalizedMatch,
  type NormalizedOdds,
} from '../lib/betsapi';
import { settleOpenBets } from '../lib/settlement';

export const MOCK_PROVIDER_NAME = 'mock';
export type { NormalizedMatch, NormalizedOdds };

/** Loose external provider payload — mapped by the universal adapter. */
export interface ProviderMatchRaw {
  id?: string;
  externalId?: string;
  external_id?: string;
  sport?: string;
  sport_name?: string;
  league?: string;
  tournament?: string;
  country?: string;
  homeTeam?: string;
  awayTeam?: string;
  home_team?: string;
  away_team?: string;
  home?: string;
  away?: string;
  status?: string;
  liveStatus?: string;
  live_status?: string;
  startTime?: string;
  start_time?: string;
  homeScore?: number;
  awayScore?: number;
  home_score?: number;
  away_score?: number;
  score?: { home?: number; away?: number; team1?: number; team2?: number };
  odds?: Partial<NormalizedOdds> & {
    home?: number;
    draw?: number;
    away?: number;
    '1'?: number;
    '2'?: number;
    over?: number;
    under?: number;
    over25?: number;
    under25?: number;
  };
  markets?: Array<{
    name?: string;
    type?: string;
    outcomes?: Array<{ name?: string; outcome?: string; odd?: number; value?: number }>;
  }>;
}

interface MockLiveState extends NormalizedMatch {
  elapsed: number;
}

const MOCK_SEED: MockLiveState[] = [
  {
    externalId: 'mock-epl-mci-ars',
    sport: 'football',
    league: 'АПЛ',
    country: 'Англия',
    homeTeam: 'Манчестер Сити',
    awayTeam: 'Арсенал',
    status: 'live',
    homeScore: 2,
    awayScore: 1,
    liveStatus: '1-й тайм, прошло 24:01',
    elapsed: 24,
    odds: { p1: 1.45, x: 4.2, p2: 5.5, tb25: 1.72, tm25: 2.1 },
  },
  {
    externalId: 'mock-nba-lal-bos',
    sport: 'basketball',
    league: 'NBA',
    country: 'США',
    homeTeam: 'Лейкерс',
    awayTeam: 'Бостон',
    status: 'live',
    homeScore: 78,
    awayScore: 82,
    liveStatus: '3-я четверть, 04:32',
    elapsed: 36,
    odds: { p1: 2.1, x: 0, p2: 1.75, tb25: 1.9, tm25: 1.9 },
  },
  {
    externalId: 'mock-atp-alc-sin',
    sport: 'tennis',
    league: 'ATP 1000',
    country: 'Мадрид',
    homeTeam: 'Алькарас',
    awayTeam: 'Синнер',
    status: 'live',
    homeScore: 1,
    awayScore: 1,
    liveStatus: '2-й сет, 4:3',
    elapsed: 18,
    odds: { p1: 1.85, x: 0, p2: 1.95, tb25: 1.8, tm25: 1.95 },
  },
  {
    externalId: 'mock-khl-csk-ska',
    sport: 'hockey',
    league: 'КХЛ',
    country: 'Россия',
    homeTeam: 'ЦСКА',
    awayTeam: 'СКА',
    status: 'live',
    homeScore: 2,
    awayScore: 2,
    liveStatus: '2-й период, 12:18',
    elapsed: 32,
    odds: { p1: 2.4, x: 3.3, p2: 2.9, tb25: 1.85, tm25: 1.95 },
  },
  {
    externalId: 'mock-cs-navi-vit',
    sport: 'esports',
    league: 'BLAST Premier',
    country: 'Киберспорт',
    homeTeam: 'Natus Vincere',
    awayTeam: 'Vitality',
    status: 'live',
    homeScore: 1,
    awayScore: 0,
    liveStatus: 'Map 2, 12:8',
    elapsed: 22,
    odds: { p1: 1.62, x: 0, p2: 2.28, tb25: 1.88, tm25: 1.92, handicapHome: 1.85, handicapAway: 1.95, handicapLine: -1.5 },
  },
];

let mockState: MockLiveState[] = MOCK_SEED.map((match) => ({
  ...match,
  odds: { ...match.odds },
}));

const TWO_WAY = new Set(['basketball', 'tennis', 'volleyball', 'esports']);

function roundOdd(value: number): number {
  return Math.round(Math.max(1.01, Math.min(25, value)) * 100) / 100;
}

function jitter(value: number, spread = 0.06): number {
  if (!value) return 0;
  return roundOdd(value + (Math.random() * 2 - 1) * spread);
}

function parseStatus(raw: string | undefined): NormalizedMatch['status'] {
  const value = (raw ?? 'upcoming').toLowerCase();
  if (/(live|inplay|in_play|1h|2h|ht)/.test(value)) return 'live';
  if (/(finish|ended|ft|final|complete)/.test(value)) return 'finished';
  return 'upcoming';
}

function pickOdd(...values: Array<number | string | undefined>): number {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function oddsFromMarkets(markets: ProviderMatchRaw['markets']): Partial<NormalizedOdds> {
  const next: Partial<NormalizedOdds> = {};
  for (const market of markets ?? []) {
    const name = `${market.name ?? ''} ${market.type ?? ''}`.toLowerCase();
    for (const outcome of market.outcomes ?? []) {
      const label = `${outcome.outcome ?? outcome.name ?? ''}`.toUpperCase().replace('Х', 'X');
      const value = pickOdd(outcome.value, outcome.odd);
      if (name.includes('1x2') || name.includes('winner') || name.includes('исход') || name.includes('победитель')) {
        if (label === '1' || label === 'П1' || label === 'HOME' || label === 'W1') next.p1 = value;
        if (label === 'X' || label === 'DRAW') next.x = value;
        if (label === '2' || label === 'П2' || label === 'AWAY' || label === 'W2') next.p2 = value;
      }
      if (name.includes('тотал') || name.includes('total') || name.includes('over')) {
        if (label.includes('ТБ') || label.includes('OVER') || label === 'O') next.tb25 = value;
        if (label.includes('ТМ') || label.includes('UNDER') || label === 'U') next.tm25 = value;
      }
    }
  }
  return next;
}

export function normalizeProviderMatch(raw: ProviderMatchRaw): NormalizedMatch {
  const fromMarkets = oddsFromMarkets(raw.markets);
  const oddsRaw = raw.odds ?? {};
  return {
    externalId: String(raw.externalId ?? raw.external_id ?? raw.id ?? ''),
    sport: (raw.sport ?? raw.sport_name ?? 'football').toLowerCase().replace(/\s+/g, '-'),
    league: raw.league ?? raw.tournament ?? 'Турнир',
    country: raw.country,
    homeTeam: raw.homeTeam ?? raw.home_team ?? raw.home ?? '',
    awayTeam: raw.awayTeam ?? raw.away_team ?? raw.away ?? '',
    status: parseStatus(raw.status),
    homeScore: Number(raw.homeScore ?? raw.home_score ?? raw.score?.home ?? raw.score?.team1 ?? 0),
    awayScore: Number(raw.awayScore ?? raw.away_score ?? raw.score?.away ?? raw.score?.team2 ?? 0),
    liveStatus: raw.liveStatus ?? raw.live_status,
    startTime: raw.startTime ?? raw.start_time,
    odds: {
      p1: pickOdd(oddsRaw.p1, oddsRaw.home, oddsRaw['1'], fromMarkets.p1),
      x: pickOdd(oddsRaw.x, oddsRaw.draw, fromMarkets.x),
      p2: pickOdd(oddsRaw.p2, oddsRaw.away, oddsRaw['2'], fromMarkets.p2),
      tb25: pickOdd(oddsRaw.tb25, oddsRaw.over, oddsRaw.over25, fromMarkets.tb25),
      tm25: pickOdd(oddsRaw.tm25, oddsRaw.under, oddsRaw.under25, fromMarkets.tm25),
    },
  };
}

function formatLiveStatus(match: MockLiveState): string {
  const elapsed = match.elapsed;
  if (match.sport === 'basketball') {
    const quarter = Math.min(4, Math.floor(elapsed / 12) + 1);
    const remain = 12 - (elapsed % 12);
    return `${quarter}-я четверть, ${String(remain).padStart(2, '0')}:${String((elapsed * 3) % 60).padStart(2, '0')}`;
  }
  if (match.sport === 'tennis') {
    return `${Math.min(3, Math.floor(elapsed / 10) + 1)}-й сет, ${4 + (elapsed % 3)}:${3 + (elapsed % 4)}`;
  }
  if (match.sport === 'hockey') {
    const period = Math.min(3, Math.floor(elapsed / 20) + 1);
    return `${period}-й период, ${String(elapsed % 20).padStart(2, '0')}:18`;
  }
  const half = elapsed < 45 ? '1-й тайм' : '2-й тайм';
  const mm = Math.min(45, elapsed % 45);
  return `${half}, прошло ${String(mm).padStart(2, '0')}:${String((elapsed * 11) % 60).padStart(2, '0')}`;
}

function bumpScore(match: MockLiveState): void {
  const roll = Math.random();
  if (match.sport === 'basketball') {
    if (roll < 0.55) {
      const pts = Math.random() < 0.35 ? 3 : 2;
      if (Math.random() < 0.5) match.homeScore += pts;
      else match.awayScore += pts;
    }
    return;
  }
  if (roll < 0.22) {
    if (Math.random() < 0.5) match.homeScore += 1;
    else match.awayScore += 1;
  }
}

export function generateMockFeed(): NormalizedMatch[] {
  mockState = mockState.map((match) => {
    const next: MockLiveState = {
      ...match,
      elapsed: match.elapsed + 1,
      odds: {
        p1: jitter(match.odds.p1),
        x: TWO_WAY.has(match.sport) ? 0 : jitter(match.odds.x, 0.12),
        p2: jitter(match.odds.p2),
        tb25: jitter(match.odds.tb25, 0.04),
        tm25: jitter(match.odds.tm25, 0.04),
      },
    };
    if (next.status === 'live') bumpScore(next);
    next.liveStatus = formatLiveStatus(next);
    return next;
  });

  return mockState.map((row) => {
    const match = { ...row };
    delete (match as { elapsed?: number }).elapsed;
    return match;
  });
}

type SyncListener = () => void;

let intervalId: ReturnType<typeof setInterval> | null = null;
let ticking = false;
let usingRealFeed = false;
let lastSettlementAt = Date.now();
const listeners = new Set<SyncListener>();

let memoryLive: NormalizedMatch[] = [];
let memoryUpcoming: NormalizedMatch[] = [];
let memoryEnded: NormalizedMatch[] = [];

function replaceBySport(current: NormalizedMatch[], incoming: NormalizedMatch[]): NormalizedMatch[] {
  if (!incoming.length) return current;
  const sports = new Set(incoming.map((match) => match.sport));
  return [...current.filter((match) => !sports.has(match.sport)), ...incoming];
}

function mergeById(current: NormalizedMatch[], incoming: NormalizedMatch[], keep = 400): NormalizedMatch[] {
  const map = new Map(current.map((match) => [match.externalId, match]));
  for (const match of incoming) {
    if (match.externalId) map.set(match.externalId, match);
  }
  return [...map.values()].slice(-keep);
}

function dropFinished(current: NormalizedMatch[], ended: NormalizedMatch[]): NormalizedMatch[] {
  const done = new Set(ended.map((match) => match.externalId));
  return current.filter((match) => match.status !== 'finished' && !done.has(match.externalId));
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function getLiveCatalog(): { live: NormalizedMatch[]; upcoming: NormalizedMatch[] } {
  return { live: memoryLive, upcoming: memoryUpcoming };
}

export function getEndedCatalog(): NormalizedMatch[] {
  return memoryEnded;
}

function applyLive(rows: NormalizedMatch[]): void {
  memoryLive = dropFinished(
    replaceBySport(
      memoryLive,
      rows.filter((match) => match.status === 'live'),
    ),
    memoryEnded,
  );
}

function applyUpcoming(rows: NormalizedMatch[]): void {
  memoryUpcoming = replaceBySport(
    memoryUpcoming.filter((match) => match.status === 'upcoming'),
    rows.filter((match) => match.status === 'upcoming'),
  );
  const liveIds = new Set(memoryLive.map((match) => match.externalId));
  memoryUpcoming = memoryUpcoming.filter((match) => !liveIds.has(match.externalId));
}

function applyEnded(rows: NormalizedMatch[]): void {
  const finished = rows.filter((match) => match.status === 'finished');
  if (!finished.length) return;
  memoryEnded = mergeById(memoryEnded, finished);
  memoryLive = dropFinished(memoryLive, finished);
}

async function runTick(): Promise<void> {
  if (ticking) return;
  if (betsApiPauseRemaining() > 0) return;
  ticking = true;
  try {
    const canUseBetsApi = typeof window !== 'undefined' || Boolean(getBetsApiToken());
    if (canUseBetsApi) {
      try {
        const now = Date.now();
        if (now - lastSettlementAt > 120_000) {
          lastSettlementAt = now;
          const ended = await fetchBetsApiEndedFeed();
          if (ended.length) applyEnded(ended);
          const settled = await settleOpenBets(memoryEnded);
          if (settled) console.info(`[settlement] closed ${settled} bets`);
        }
        try {
          const live = await fetchBetsApiLiveFeed();
          if (live.length) {
            applyLive(live);
            usingRealFeed = true;
          }
          const upcoming = await fetchBetsApiUpcomingFeed();
          if (upcoming.length) applyUpcoming(upcoming);
        } catch (feedErr) {
          if (feedErr instanceof BetsApiRateLimitError) {
            console.warn(`[betsapi] ${feedErr.message}`);
          } else {
            console.error('BetsAPI live feed failed:', feedErr);
          }
        }
        if (!memoryLive.length && !usingRealFeed) {
          applyLive(generateMockFeed().map((row) => normalizeProviderMatch(row)));
        }
        notify();
        return;
      } catch (err) {
        if (err instanceof BetsApiRateLimitError) {
          console.warn(`[betsapi] ${err.message}`);
          return;
        }
        console.error('BetsAPI feed tick failed:', err);
      }
    }

    if (usingRealFeed) {
      notify();
      return;
    }

    applyLive(generateMockFeed().map((row) => normalizeProviderMatch(row)));
    notify();
  } catch (err) {
    console.error('Sports feed tick failed:', err);
  } finally {
    ticking = false;
  }
}

export function startSportsFeed(intervalMs = 15_000, onSynced?: SyncListener): () => void {
  if (onSynced) listeners.add(onSynced);
  if (!intervalId) {
    void runTick();
    intervalId = setInterval(() => {
      void runTick();
    }, intervalMs);
  }

  return () => {
    if (onSynced) listeners.delete(onSynced);
    if (listeners.size === 0 && intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}
