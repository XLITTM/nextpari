import { adaptLsportsStore } from '../adapter/adapt.js';
import {
  NEXTPARI_1X2_MARKET_KEY,
  type AdaptedMarket,
  type LsportsAdaptedMatch,
} from '../adapter/types.js';
import { containsSecret } from '../redact.js';
import type { LsportsInPlayStore } from '../state/store.js';
import type { LsportsFeedHealth } from '../state/types.js';
import {
  sanitizeDistributionDiagnostics,
  type LsportsDistributionSnapshot,
} from './status.js';

export const LSPORTS_LOCKED_1X2: AdaptedMarket = {
  key: NEXTPARI_1X2_MARKET_KEY,
  bookmaker: '1',
  marketId: '1',
  name: '1X2',
  category: 'main',
  entries: [],
};

export interface LsportsBrowserDiagnostics {
  health: LsportsFeedHealth;
  fixtureCount: number;
  activeFixtureCount: number;
  adaptedFixtureCount: number;
  marketCount: number;
  lastUpdateAt: number;
  lastHeartbeatAt: number | null;
  unsupportedMarkets: Array<{ marketId: string; name: string; count: number }>;
  suspendedMarketCount: number;
  suspendedOutcomeCount: number;
  fixturesMissing1x2: string[];
  distributionActive: boolean | null;
  consumerCount: number | null;
  numberMessagesInQueue: number | null;
  messagesPerSecond: number | null;
  queueWarning: boolean;
}

export interface LsportsBrowserFeed {
  source: 'lsports';
  health: LsportsFeedHealth;
  generatedAt: number;
  matches: LsportsAdaptedMatch[];
  diagnostics: LsportsBrowserDiagnostics;
}

export function lockLsportsDisplayMatches(matches: LsportsAdaptedMatch[]): LsportsAdaptedMatch[] {
  return matches.map((row) => ({
    event: row.event,
    markets: [{ ...LSPORTS_LOCKED_1X2, entries: [] }],
  }));
}

export function displayHealthFromSources(
  heartbeatHealth: LsportsFeedHealth,
  distribution: LsportsDistributionSnapshot | null | undefined,
): LsportsFeedHealth {
  if (distribution?.distributionActive === false) return 'STALE';
  return heartbeatHealth;
}

export function buildLsportsBrowserPayload(
  store: LsportsInPlayStore,
  now = Date.now(),
  distribution: LsportsDistributionSnapshot | null = null,
): LsportsBrowserFeed {
  const heartbeatHealth = store.feedHealth(now);
  const health = displayHealthFromSources(heartbeatHealth, distribution);
  const adapted = adaptLsportsStore(store);
  const matches = health === 'HEALTHY'
    ? adapted.matches
    : lockLsportsDisplayMatches(adapted.matches);
  const metrics = store.metrics();
  const lastHeartbeatAt = store.getLastHeartbeatServerTimestamp();
  const distributionDiagnostics = sanitizeDistributionDiagnostics(
    distribution,
    heartbeatHealth,
    lastHeartbeatAt,
  );
  return {
    source: 'lsports',
    health,
    generatedAt: now,
    matches,
    diagnostics: {
      health,
      fixtureCount: metrics.fixtureCount,
      activeFixtureCount: metrics.activeFixtureCount,
      adaptedFixtureCount: adapted.diagnostics.adaptedLiveFootballCount,
      marketCount: health === 'HEALTHY' ? adapted.diagnostics.adaptedMarketCount : 0,
      lastUpdateAt: now,
      lastHeartbeatAt,
      unsupportedMarkets: adapted.diagnostics.unsupportedMarkets,
      fixturesMissing1x2: adapted.diagnostics.fixturesMissing1x2,
      suspendedMarketCount: adapted.diagnostics.suspendedMarketCount,
      suspendedOutcomeCount: adapted.diagnostics.suspendedOutcomeCount,
      distributionActive: distributionDiagnostics.distributionActive,
      consumerCount: distributionDiagnostics.consumerCount,
      numberMessagesInQueue: distributionDiagnostics.numberMessagesInQueue,
      messagesPerSecond: distributionDiagnostics.messagesPerSecond,
      queueWarning: distributionDiagnostics.queueWarning,
    },
  };
}

export function browserPayloadHasSecrets(
  payload: LsportsBrowserFeed,
  secrets: readonly string[],
): boolean {
  return containsSecret(JSON.stringify(payload), secrets);
}
