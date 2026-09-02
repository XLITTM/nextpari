import type { InplayMatch } from '../services/sports';
import { useSportsStore } from '../stores/sportsStore';
import type { ParsedMarket } from './odds-parser';
import {
  LSPORTS_LOCKED_1X2,
  LSPORTS_SHADOW_INPLAY_PATH,
  displayMatchesFromFeed,
  lsportsHealthUrl,
  lsportsInplayUrl,
  parseLsportsBrowserFeed,
  type LsportsBrowserFeed,
} from './lsportsShadowFeed';

export {
  LSPORTS_LOCKED_1X2,
  LSPORTS_SHADOW_INPLAY_PATH,
  displayMatchesFromFeed,
  lsportsHealthUrl,
  lsportsInplayUrl,
  type LsportsBrowserFeed,
};

/** Writes a full LSports-adapted live set into the existing sportsStore. */
export function applyLsportsShadowInplay(matches: InplayMatch[]): void {
  const events = matches.map((row) => row.event);
  const marketsById: Record<string, ParsedMarket[]> = {};
  for (const row of matches) {
    marketsById[row.event.id] = row.markets.length ? row.markets : [LSPORTS_LOCKED_1X2];
  }
  useSportsStore.getState().applyInplay(events, marketsById);
}

export function applyLsportsBrowserFeed(feed: LsportsBrowserFeed): void {
  applyLsportsShadowInplay(displayMatchesFromFeed(feed));
}

export async function fetchLsportsShadowInplay(signal?: AbortSignal): Promise<LsportsBrowserFeed> {
  const response = await fetch(lsportsInplayUrl(), {
    signal,
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!response.ok) {
    throw new Error(`lsports-feed-http-${response.status}`);
  }
  return parseLsportsBrowserFeed(await response.json());
}

export async function fetchLsportsShadowHealth(signal?: AbortSignal): Promise<{ health?: string }> {
  const response = await fetch(lsportsHealthUrl(), {
    signal,
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!response.ok) {
    throw new Error(`lsports-health-http-${response.status}`);
  }
  const json = await response.json() as { source?: string; health?: string };
  if (json.source != null && json.source !== 'lsports') {
    throw new Error('lsports-health-invalid');
  }
  return json;
}
