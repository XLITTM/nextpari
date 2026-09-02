import { adaptLsportsStore } from '../adapter/adapt.js';
import {
  NEXTPARI_1X2_MARKET_KEY,
  type AdaptedMarket,
  type LsportsAdaptedMatch,
  type LsportsMarket1AdapterDiagnostics,
} from '../adapter/types.js';
import { containsSecret } from '../redact.js';
import type { LsportsInPlayStore } from '../state/store.js';
import type {
  LsportsFeedHealth,
  LsportsMarketInventory,
  LsportsRecoveryMode,
} from '../state/types.js';
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

const MISSING_1X2_SAMPLE = 8;

export interface LsportsBrowserDiagnostics {
  health: LsportsFeedHealth;
  fixtureCount: number;
  activeFixtureCount: number;
  adaptedFixtureCount: number;
  /** Adapted (display) 1X2 markets. Prefer adaptedMarketCount. */
  marketCount: number;
  adaptedMarketCount: number;
  storeMarketCount: number;
  lastUpdateAt: number;
  lastHeartbeatAt: number | null;
  unsupportedMarkets: Array<{ marketId: string; name: string; count: number }>;
  suspendedMarketCount: number;
  suspendedOutcomeCount: number;
  fixturesMissing1x2Count: number;
  fixturesMissing1x2: string[];
  marketInventory: LsportsMarketInventory;
  market1Adapter: LsportsMarket1AdapterDiagnostics;
  recoveryMode: LsportsRecoveryMode | null;
  buffering: boolean;
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
  recovery: { mode?: LsportsRecoveryMode | null; buffering?: boolean } | null = null,
): LsportsBrowserFeed {
  const heartbeatHealth = store.feedHealth(now);
  const health = displayHealthFromSources(heartbeatHealth, distribution);
  const adapted = adaptLsportsStore(store);
  const matches = health === 'HEALTHY'
    ? adapted.matches
    : lockLsportsDisplayMatches(adapted.matches);
  const metrics = store.metrics();
  const inventory = store.marketInventory();
  const lastHeartbeatAt = store.getLastHeartbeatServerTimestamp();
  const distributionDiagnostics = sanitizeDistributionDiagnostics(
    distribution,
    heartbeatHealth,
    lastHeartbeatAt,
  );
  const missing = adapted.diagnostics.fixturesMissing1x2;
  const adaptedMarketCount = health === 'HEALTHY' ? adapted.diagnostics.adaptedMarketCount : 0;
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
      marketCount: adaptedMarketCount,
      adaptedMarketCount,
      storeMarketCount: inventory.storeMarketCount,
      lastUpdateAt: now,
      lastHeartbeatAt,
      unsupportedMarkets: adapted.diagnostics.unsupportedMarkets.slice(0, 40),
      fixturesMissing1x2Count: missing.length,
      fixturesMissing1x2: missing.slice(0, MISSING_1X2_SAMPLE),
      suspendedMarketCount: adapted.diagnostics.suspendedMarketCount,
      suspendedOutcomeCount: adapted.diagnostics.suspendedOutcomeCount,
      marketInventory: inventory,
      market1Adapter: adapted.diagnostics.market1Adapter,
      recoveryMode: recovery?.mode ?? null,
      buffering: Boolean(recovery?.buffering),
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
