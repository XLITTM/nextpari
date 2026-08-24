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
  return {
    live: memoryLive.filter((match) => match.status === 'live'),
    upcoming: memoryUpcoming.filter((match) => match.status === 'upcoming'),
  };
}

export function getEndedCatalog(): NormalizedMatch[] {
  return memoryEnded;
}

function applyLive(rows: NormalizedMatch[], sport?: string): void {
  const live = rows.filter((match) => match.status === 'live');
  const sports = new Set<string>();
  if (sport) sports.add(sport);
  for (const match of rows) sports.add(match.sport);
  memoryLive = sports.size
    ? [...memoryLive.filter((match) => match.status === 'live' && !sports.has(match.sport)), ...live]
    : live;
  memoryLive = dropFinished(memoryLive, memoryEnded);
}

function applyUpcoming(rows: NormalizedMatch[], sport?: string): void {
  const upcoming = rows.filter((match) => match.status === 'upcoming');
  const sports = new Set<string>();
  if (sport) sports.add(sport);
  for (const match of rows) sports.add(match.sport);
  memoryUpcoming = sports.size
    ? [...memoryUpcoming.filter((match) => match.status === 'upcoming' && !sports.has(match.sport)), ...upcoming]
    : upcoming;
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
          applyLive(live.matches, live.sport);
          usingRealFeed = true;
          const upcoming = await fetchBetsApiUpcomingFeed();
          applyUpcoming(upcoming.matches, upcoming.sport);
        } catch (feedErr) {
          if (feedErr instanceof BetsApiRateLimitError) {
            console.warn(`[betsapi] ${feedErr.message}`);
          } else {
            console.error('BetsAPI live feed failed:', feedErr);
          }
        }
        if (!memoryLive.length && !usingRealFeed) {
          notify();
          return;
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
    memoryLive = [];
    memoryUpcoming = [];
    usingRealFeed = false;
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
