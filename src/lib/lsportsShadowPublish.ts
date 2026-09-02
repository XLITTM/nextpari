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
  shouldApplyLsportsGeneratedAt,
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

let lastAppliedGeneratedAt = 0;
let inFlight: AbortController | null = null;
let fetchGeneration = 0;

export function resetLsportsFeedApplyForTests(): void {
  lastAppliedGeneratedAt = 0;
  fetchGeneration = 0;
  inFlight?.abort();
  inFlight = null;
}

export function lastAppliedLsportsGeneratedAt(): number {
  return lastAppliedGeneratedAt;
}

/** Writes a full LSports-adapted live set into the existing sportsStore. */
export function applyLsportsShadowInplay(matches: InplayMatch[]): void {
  const events = matches.map((row) => row.event);
  const marketsById: Record<string, ParsedMarket[]> = {};
  for (const row of matches) {
    marketsById[row.event.id] = row.markets.length ? row.markets : [LSPORTS_LOCKED_1X2];
  }
  useSportsStore.getState().applyInplay(events, marketsById);
}

export function applyLsportsBrowserFeed(feed: LsportsBrowserFeed): boolean {
  if (!shouldApplyLsportsGeneratedAt(feed.generatedAt, lastAppliedGeneratedAt)) {
    return false;
  }
  applyLsportsShadowInplay(displayMatchesFromFeed(feed));
  if (feed.generatedAt) lastAppliedGeneratedAt = feed.generatedAt;
  return true;
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
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error('lsports-feed-invalid');
  }
  return parseLsportsBrowserFeed(json);
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

export async function pollLsportsBrowserFeed(): Promise<LsportsBrowserFeed> {
  inFlight?.abort();
  const generation = ++fetchGeneration;
  const controller = new AbortController();
  inFlight = controller;
  try {
    const feed = await fetchLsportsShadowInplay(controller.signal);
    if (generation !== fetchGeneration) {
      throw new DOMException('stale-generation', 'AbortError');
    }
    return feed;
  } finally {
    if (inFlight === controller) inFlight = null;
  }
}
