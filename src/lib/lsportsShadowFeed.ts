import type { InplayMatch } from '../services/sports';
import { isLsportsDisplayEvent } from './lsportsFeed';
import type { ParsedMarket } from './odds-parser';

export const LSPORTS_SHADOW_INPLAY_PATH = '/api/lsports/inplay';
export const LSPORTS_SHADOW_HEALTH_PATH = '/api/lsports/health';
export const LSPORTS_RAILWAY_INPLAY_PATH = '/inplay';
export const LSPORTS_RAILWAY_HEALTH_PATH = '/health';

type LsportsFeedEnv = { VITE_LSPORTS_FEED_BASE_URL?: string; DEV?: boolean };

function viteEnv(): LsportsFeedEnv {
  return (import.meta as { env?: LsportsFeedEnv }).env ?? {};
}

function isViteDev(env: LsportsFeedEnv): boolean {
  return env.DEV === true;
}

export function readLsportsFeedBaseUrl(
  env: LsportsFeedEnv = viteEnv(),
): string {
  return String(env.VITE_LSPORTS_FEED_BASE_URL ?? '').trim().replace(/\/$/, '');
}

/**
 * Production/preview: browser fetches Railway `/inplay` directly.
 * Vite DEV: same-origin `/api/lsports/*` so the local UI can consume Railway
 * without waiting on worker CORS for 127.0.0.1. The Vite plugin proxies to
 * VITE_LSPORTS_FEED_BASE_URL. Passing an explicit env object always honors it
 * (tests and production-shaped checks).
 */
export function lsportsInplayUrl(
  env?: LsportsFeedEnv,
): string {
  const resolved = env ?? viteEnv();
  const base = readLsportsFeedBaseUrl(resolved);
  if (!env && isViteDev(resolved) && base) return LSPORTS_SHADOW_INPLAY_PATH;
  return base ? `${base}${LSPORTS_RAILWAY_INPLAY_PATH}` : LSPORTS_SHADOW_INPLAY_PATH;
}

export function lsportsHealthUrl(
  env?: LsportsFeedEnv,
): string {
  const resolved = env ?? viteEnv();
  const base = readLsportsFeedBaseUrl(resolved);
  if (!env && isViteDev(resolved) && base) return LSPORTS_SHADOW_HEALTH_PATH;
  return base ? `${base}${LSPORTS_RAILWAY_HEALTH_PATH}` : LSPORTS_SHADOW_HEALTH_PATH;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseMatch(value: unknown): InplayMatch | null {
  const row = asRecord(value);
  const event = asRecord(row?.event);
  if (!row || !event || event.id == null || String(event.id).trim() === '') return null;
  const markets = Array.isArray(row.markets) ? row.markets as ParsedMarket[] : [];
  return {
    event: event as unknown as InplayMatch['event'],
    markets,
  };
}

export function parseLsportsBrowserFeed(value: unknown): LsportsBrowserFeed {
  const row = asRecord(value);
  if (!row || row.source !== 'lsports') {
    throw new Error('lsports-feed-invalid');
  }
  const health = row.health === 'HEALTHY' || row.health === 'STALE' || row.health === 'UNKNOWN'
    ? row.health
    : 'UNKNOWN';
  const matches = Array.isArray(row.matches)
    ? row.matches.flatMap((entry) => {
      const match = parseMatch(entry);
      return match ? [match] : [];
    })
    : [];
  const diagnostics = asRecord(row.diagnostics);
  return {
    source: 'lsports',
    health,
    generatedAt: Number(row.generatedAt) || 0,
    matches,
    diagnostics: diagnostics
      ? {
        health: diagnostics.health === 'HEALTHY' || diagnostics.health === 'STALE' || diagnostics.health === 'UNKNOWN'
          ? diagnostics.health
          : health,
        fixtureCount: Number(diagnostics.fixtureCount) || 0,
        activeFixtureCount: Number(diagnostics.activeFixtureCount) || 0,
        adaptedFixtureCount: Number(diagnostics.adaptedFixtureCount) || 0,
        marketCount: Number(diagnostics.marketCount) || 0,
        lastUpdateAt: Number(diagnostics.lastUpdateAt) || 0,
      }
      : undefined,
  };
}

export function shouldApplyLsportsGeneratedAt(
  incomingGeneratedAt: number,
  lastAppliedGeneratedAt: number,
): boolean {
  if (!incomingGeneratedAt || !lastAppliedGeneratedAt) return true;
  return incomingGeneratedAt >= lastAppliedGeneratedAt;
}

export function displayMatchesFromFeed(feed: LsportsBrowserFeed): InplayMatch[] {
  const matches = feed.matches.filter((row) => isLsportsDisplayEvent(row.event));
  if (feed.health === 'HEALTHY') return matches;
  return matches.map((row) => ({ event: row.event, markets: [LSPORTS_LOCKED_1X2] }));
}
