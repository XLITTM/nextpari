export const LSPORTS_FEED_TAG = 'lsports';

const FAKE_1X2 = { home: 2.1, draw: 3.25, away: 2.8 } as const;

let testOverride: boolean | null = null;

export function setLsportsDisplayFeedEnabledForTests(value: boolean | null): void {
  testOverride = value;
}

/**
 * Client shadow-feed switch. VITE_LSPORTS_DISPLAY_FEED is a boolean selector,
 * not a secret. Never put LSports credentials in VITE_* variables.
 */
export function isLsportsDisplayFeedEnabled(): boolean {
  if (testOverride != null) return testOverride;
  try {
    return String((import.meta as { env?: { VITE_LSPORTS_DISPLAY_FEED?: string } }).env?.VITE_LSPORTS_DISPLAY_FEED ?? '') === '1';
  } catch {
    return false;
  }
}

export function isLsportsDisplayEvent(event: { our_events?: string } | null | undefined): boolean {
  return event?.our_events === LSPORTS_FEED_TAG;
}

export function isFakeDefault1x2(odds: { '1'?: number; x?: number; '2'?: number }): boolean {
  return odds['1'] === FAKE_1X2.home && odds.x === FAKE_1X2.draw && odds['2'] === FAKE_1X2.away;
}

export function realOrLockedOdds(value: number): number {
  return value > 1 ? value : 0;
}

export function lsportsCardMarkets(raw: { '1': number; x: number; '2': number }): {
  markets: { '1': number; x: number; '2': number };
  marketsLocked: boolean;
} {
  const markets = {
    '1': realOrLockedOdds(raw['1']),
    x: realOrLockedOdds(raw.x),
    '2': realOrLockedOdds(raw['2']),
  };
  return {
    markets,
    marketsLocked: !(markets['1'] > 1 && markets.x > 1 && markets['2'] > 1),
  };
}
