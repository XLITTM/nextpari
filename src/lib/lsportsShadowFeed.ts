import type { InplayMatch } from '../services/sports';
import type { ParsedMarket } from './odds-parser';

export const LSPORTS_SHADOW_INPLAY_PATH = '/api/lsports/inplay';
export const LSPORTS_SHADOW_HEALTH_PATH = '/api/lsports/health';

export function readLsportsFeedBaseUrl(
  env: { VITE_LSPORTS_FEED_BASE_URL?: string } = (import.meta as { env?: { VITE_LSPORTS_FEED_BASE_URL?: string } }).env ?? {},
): string {
  return String(env.VITE_LSPORTS_FEED_BASE_URL ?? '').trim().replace(/\/$/, '');
}

export function lsportsInplayUrl(
  env?: { VITE_LSPORTS_FEED_BASE_URL?: string },
): string {
  const base = readLsportsFeedBaseUrl(env);
  return base ? `${base}/inplay` : LSPORTS_SHADOW_INPLAY_PATH;
}

export function lsportsHealthUrl(
  env?: { VITE_LSPORTS_FEED_BASE_URL?: string },
): string {
  const base = readLsportsFeedBaseUrl(env);
  return base ? `${base}/health` : LSPORTS_SHADOW_HEALTH_PATH;
}

export const LSPORTS_LOCKED_1X2: ParsedMarket = {
  key: '1_1',
  bookmaker: '1',
  marketId: '1',
  name: '1X2',
  category: 'main',
  entries: [],
};

export interface LsportsBrowserFeed {
  source: 'lsports';
  health: 'HEALTHY' | 'STALE' | 'UNKNOWN';
  generatedAt: number;
  matches: InplayMatch[];
  diagnostics?: {
    health: 'HEALTHY' | 'STALE' | 'UNKNOWN';
    fixtureCount: number;
    activeFixtureCount: number;
    adaptedFixtureCount: number;
    marketCount: number;
    lastUpdateAt: number;
  };
}

export function displayMatchesFromFeed(feed: LsportsBrowserFeed): InplayMatch[] {
  if (feed.health === 'HEALTHY') return feed.matches;
  return feed.matches.map((row) => ({ event: row.event, markets: [LSPORTS_LOCKED_1X2] }));
}
