import { adaptLsportsPrematchStore } from '../adapter/prematchAdapt.js';
import { participantNames } from '../adapter/event.js';
import { readBetId, readBets } from '../state/parse.js';
import { containsSecret } from '../redact.js';
import type { LsportsInPlayStore } from '../state/store.js';
import type {
  LsportsFeedHealth,
  LsportsIngestCounters,
  LsportsRecoveryMode,
} from '../state/types.js';
import { LSPORTS_LOCKED_1X2, type LsportsBrowserDiagnostics } from '../bridge/payload.js';
import {
  sanitizeDistributionDiagnostics,
  type LsportsDistributionSnapshot,
} from '../bridge/status.js';
import type { LsportsAdaptedMatch } from '../adapter/types.js';
import { readNamed, toDecimalPrice } from '../adapter/read.js';
import { classifyPrematchFootballMarket } from '../adapter/prematchMarkets.js';

export const LSPORTS_PREMATCH_SOURCE = 'lsports-prematch';

export interface LsportsPrematchSample {
  fixtureId: number;
  league: string;
  home: string;
  away: string;
  startDate: string | null;
  marketId: string;
  marketName: string;
  betId: string;
  betName: string;
  price: number;
  status: string | number | null;
}

export interface LsportsPrematchDiagnostics extends LsportsBrowserDiagnostics {
  packageId: number;
  consumerConnected: boolean;
  lastMessageAt: number | null;
  parseFailures: number;
  messageTypeCounters: {
    type1: number;
    type2: number;
    type3: number;
    type31: number;
    type32: number;
    type35: number;
    typeUnknown: number;
    typeNull: number;
  };
  open1x2WithPricesCount: number;
  sample: LsportsPrematchSample | null;
}

export interface LsportsPrematchFeed {
  source: typeof LSPORTS_PREMATCH_SOURCE;
  health: LsportsFeedHealth;
  generatedAt: number;
  matches: LsportsAdaptedMatch[];
  diagnostics: LsportsPrematchDiagnostics;
}

export function emptyPrematchFeed(
  now = Date.now(),
  extras: Partial<LsportsPrematchDiagnostics> = {},
): LsportsPrematchFeed {
  const ingest = extras.messageTypeCounters ?? {
    type1: 0,
    type2: 0,
    type3: 0,
    type31: 0,
    type32: 0,
    type35: 0,
    typeUnknown: 0,
    typeNull: 0,
  };
  return {
    source: LSPORTS_PREMATCH_SOURCE,
    health: extras.health ?? 'UNKNOWN',
    generatedAt: now,
    matches: [],
    diagnostics: {
      health: extras.health ?? 'UNKNOWN',
      packageId: extras.packageId ?? 4352,
      fixtureCount: 0,
      activeFixtureCount: 0,
      adaptedFixtureCount: 0,
      marketCount: 0,
      adaptedMarketCount: 0,
      storeMarketCount: 0,
      lastUpdateAt: now,
      lastHeartbeatAt: null,
      unsupportedMarkets: [],
      suspendedMarketCount: 0,
      suspendedOutcomeCount: 0,
      fixturesMissing1x2Count: 0,
      fixturesMissing1x2: [],
      marketInventory: extras.marketInventory ?? {
        fixturesWithMarkets: 0,
        storeMarketCount: 0,
        byMarketId: [],
        market1: {
          count: 0,
          openMarketCount: 0,
          marketStatus: {},
          betStatus: {},
          betStatusId: {},
          betNames: {},
          validPriceCount: 0,
          sampleFixtureIds: [],
        },
        ingest: extras.messageTypeCounters
          ? countersFromTypes(ingest)
          : emptyCounters(),
      },
      market1Adapter: {
        seen: 0,
        adapted: 0,
        rejectedSettledMarket: 0,
        rejectedSuspendedMarket: 0,
        rejectedNoOutcomes: 0,
        settlementBlockedBets: 0,
        badPriceBets: 0,
        badNameBets: 0,
        openSelectableOutcomes: 0,
      },
      recoveryMode: extras.recoveryMode ?? null,
      buffering: extras.buffering ?? false,
      distributionActive: extras.distributionActive ?? null,
      consumerCount: extras.consumerCount ?? null,
      numberMessagesInQueue: extras.numberMessagesInQueue ?? null,
      messagesPerSecond: extras.messagesPerSecond ?? null,
      queueWarning: extras.queueWarning ?? false,
      consumerConnected: extras.consumerConnected ?? false,
      lastMessageAt: extras.lastMessageAt ?? null,
      parseFailures: extras.parseFailures ?? 0,
      messageTypeCounters: ingest,
      open1x2WithPricesCount: 0,
      sample: null,
    },
  };
}

function emptyCounters(): LsportsIngestCounters {
  return {
    rmqReceived: 0,
    rmqParsed: 0,
    rmqParseFailed: 0,
    type1Messages: 0,
    type2Messages: 0,
    type3Messages: 0,
    type31Messages: 0,
    type32Messages: 0,
    type35Messages: 0,
    typeUnknownMessages: 0,
    typeNullMessages: 0,
    snapshotMarketEvents: 0,
    marketsAppliedFromType3: 0,
    marketsAppliedFromSnapshot: 0,
    market1AppliedFromType3: 0,
    market1AppliedFromSnapshot: 0,
  };
}

function countersFromTypes(types: LsportsPrematchDiagnostics['messageTypeCounters']): LsportsIngestCounters {
  return {
    ...emptyCounters(),
    type1Messages: types.type1,
    type2Messages: types.type2,
    type3Messages: types.type3,
    type31Messages: types.type31,
    type32Messages: types.type32,
    type35Messages: types.type35,
    typeUnknownMessages: types.typeUnknown,
    typeNullMessages: types.typeNull,
  };
}

export function prematchHealthFromSources(
  heartbeatHealth: LsportsFeedHealth,
  distribution: LsportsDistributionSnapshot | null | undefined,
  lastMessageAt: number | null,
  consumerConnected: boolean,
  now: number,
): LsportsFeedHealth {
  if (distribution?.distributionActive === false) return 'STALE';
  if (heartbeatHealth === 'HEALTHY') return 'HEALTHY';
  if (consumerConnected && lastMessageAt != null && now - lastMessageAt <= 30_000) return 'HEALTHY';
  return heartbeatHealth;
}

function pickOpen1x2Sample(store: LsportsInPlayStore): LsportsPrematchSample | null {
  let found: LsportsPrematchSample | null = null;
  for (const fixture of store.listFixtures()) {
    const names = participantNames(fixture);
    for (const market of fixture.markets.values()) {
      if (classifyPrematchFootballMarket(market) !== '1x2') continue;
      const status = market.payload.Status ?? market.payload.status;
      if (status !== 1 && status !== '1') continue;
      for (const bet of readBets(market.payload)) {
        const betStatus = bet.Status ?? bet.status;
        if (betStatus != null && betStatus !== 1 && betStatus !== '1') continue;
        const price = toDecimalPrice(bet.Price ?? bet.price);
        const betId = readBetId(bet);
        if (price == null || betId == null) continue;
        found = {
          fixtureId: fixture.fixtureId,
          league: readNamed(fixture.fixture?.League).name ?? '',
          home: names.home ?? '',
          away: names.away ?? '',
          startDate: typeof fixture.fixture?.StartDate === 'string'
            ? fixture.fixture.StartDate
            : typeof fixture.fixture?.startDate === 'string'
              ? fixture.fixture.startDate
              : null,
          marketId: String(market.marketId ?? ''),
          marketName: readNamed(market.payload).name ?? '1X2',
          betId: String(betId),
          betName: String(bet.Name ?? bet.name ?? ''),
          price,
          status: (betStatus as string | number | null) ?? null,
        };
        return found;
      }
    }
    if (found) break;
  }
  return found;
}

export function buildLsportsPrematchPayload(
  store: LsportsInPlayStore,
  now = Date.now(),
  extras: {
    distribution?: LsportsDistributionSnapshot | null;
    recovery?: { mode?: LsportsRecoveryMode | null; buffering?: boolean } | null;
    consumerConnected?: boolean;
    lastMessageAt?: number | null;
    packageId?: number;
  } = {},
): LsportsPrematchFeed {
  const heartbeatHealth = store.feedHealth(now);
  const consumerConnected = extras.consumerConnected ?? false;
  const lastMessageAt = extras.lastMessageAt ?? null;
  const health = prematchHealthFromSources(
    heartbeatHealth,
    extras.distribution,
    lastMessageAt,
    consumerConnected,
    now,
  );
  const adapted = adaptLsportsPrematchStore(store);
  const matches = extras.distribution?.distributionActive === false
    ? adapted.matches.map((row) => ({
      event: row.event,
      markets: [{ ...LSPORTS_LOCKED_1X2, entries: [] }],
    }))
    : adapted.matches;
  const metrics = store.metrics();
  const inventory = store.marketInventory();
  const lastHeartbeatAt = store.getLastHeartbeatServerTimestamp();
  const distributionDiagnostics = sanitizeDistributionDiagnostics(
    extras.distribution ?? null,
    heartbeatHealth,
    lastHeartbeatAt,
  );
  const ingest = store.getIngestCounters();
  const missing = adapted.diagnostics.fixturesMissing1x2;
  const adaptedMarketCount = extras.distribution?.distributionActive === false
    ? 0
    : adapted.diagnostics.adaptedMarketCount;
  return {
    source: LSPORTS_PREMATCH_SOURCE,
    health,
    generatedAt: now,
    matches,
    diagnostics: {
      health,
      packageId: extras.packageId ?? 4352,
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
      fixturesMissing1x2: missing.slice(0, 8),
      suspendedMarketCount: adapted.diagnostics.suspendedMarketCount,
      suspendedOutcomeCount: adapted.diagnostics.suspendedOutcomeCount,
      marketInventory: inventory,
      market1Adapter: adapted.diagnostics.market1Adapter,
      recoveryMode: extras.recovery?.mode ?? null,
      buffering: Boolean(extras.recovery?.buffering),
      distributionActive: distributionDiagnostics.distributionActive,
      consumerCount: distributionDiagnostics.consumerCount,
      numberMessagesInQueue: distributionDiagnostics.numberMessagesInQueue,
      messagesPerSecond: distributionDiagnostics.messagesPerSecond,
      queueWarning: distributionDiagnostics.queueWarning,
      consumerConnected,
      lastMessageAt,
      parseFailures: ingest.rmqParseFailed,
      messageTypeCounters: {
        type1: ingest.type1Messages,
        type2: ingest.type2Messages,
        type3: ingest.type3Messages,
        type31: ingest.type31Messages,
        type32: ingest.type32Messages,
        type35: ingest.type35Messages,
        typeUnknown: ingest.typeUnknownMessages,
        typeNull: ingest.typeNullMessages,
      },
      open1x2WithPricesCount: adapted.open1x2WithPricesCount,
      sample: pickOpen1x2Sample(store),
    },
  };
}

export function prematchPayloadHasSecrets(
  payload: LsportsPrematchFeed,
  secrets: readonly string[],
): boolean {
  return containsSecret(JSON.stringify(payload), secrets);
}

export function sanitizePrematchHealth(payload: LsportsPrematchFeed | null): Record<string, unknown> {
  if (!payload) {
    return {
      available: false,
      health: 'UNKNOWN',
      consumerConnected: false,
      packageId: 4352,
    };
  }
  return {
    available: true,
    source: payload.source,
    health: payload.health,
    packageId: payload.diagnostics.packageId,
    generatedAt: payload.generatedAt,
    fixtureCount: payload.diagnostics.fixtureCount,
    adaptedFixtureCount: payload.diagnostics.adaptedFixtureCount,
    storeMarketCount: payload.diagnostics.storeMarketCount,
    adaptedMarketCount: payload.diagnostics.adaptedMarketCount,
    open1x2WithPricesCount: payload.diagnostics.open1x2WithPricesCount,
    distributionActive: payload.diagnostics.distributionActive,
    consumerConnected: payload.diagnostics.consumerConnected,
    consumerCount: payload.diagnostics.consumerCount,
    numberMessagesInQueue: payload.diagnostics.numberMessagesInQueue,
    messagesPerSecond: payload.diagnostics.messagesPerSecond,
    lastMessageAt: payload.diagnostics.lastMessageAt,
    lastHeartbeatAt: payload.diagnostics.lastHeartbeatAt,
    parseFailures: payload.diagnostics.parseFailures,
    messageTypeCounters: payload.diagnostics.messageTypeCounters,
    recoveryMode: payload.diagnostics.recoveryMode,
    buffering: payload.diagnostics.buffering,
    queueWarning: payload.diagnostics.queueWarning,
    byMarketId: payload.diagnostics.marketInventory.byMarketId.slice(0, 20),
    sample: payload.diagnostics.sample,
  };
}
