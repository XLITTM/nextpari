import { createRequire } from 'node:module';
import { TRADE360_SDK_PACKAGE } from './constants.js';

export { TRADE360_SDK_NODE_REQUIREMENT, TRADE360_SDK_PACKAGE, TRADE360_SDK_VERSION } from './constants.js';

export type Trade360Sdk = ReturnType<typeof loadTrade360Sdk>;

export function loadTrade360Sdk(): {
  Feed: new (settings: unknown, logger?: unknown) => {
    addEntityHandler: (handler: unknown, entity: unknown) => void | Promise<void>;
    start: (preConnectionAtStart?: boolean) => Promise<void>;
    stop: () => Promise<void>;
  };
  FixtureMetadataUpdate: unknown;
  LivescoreUpdate: unknown;
  MarketUpdate: unknown;
  KeepAliveUpdate: unknown;
  HeartbeatUpdate: unknown;
  SettlementUpdate: unknown;
  CustomersApiFactory: new () => {
    createSubscriptionHttpClient: (config: unknown) => {
      subscribeByFixtures: (request: unknown) => Promise<{ fixtures?: Array<{ success?: boolean; errorMessage?: string }> } | undefined>;
      getPackageQuota: () => Promise<{ creditRemaining?: number } | undefined>;
    };
    createPackageDistributionHttpClient: (config: unknown) => {
      getDistributionStatus: (body: unknown) => Promise<{
        isDistributionOn?: boolean;
        consumers?: unknown;
        numberMessagesInQueue?: number;
      } | undefined>;
    };
  };
  SnapshotApiFactory: new () => {
    createSnapshotApiInPlayHttpClient: (config: unknown) => {
      getFixtures: (dto: never) => Promise<unknown>;
      getLivescores: (dto: never) => Promise<unknown>;
      getFixtureMarkets: (dto: never) => Promise<unknown>;
      getEvents: (dto: never) => Promise<unknown>;
    };
    createSnapshotApiPrematchHttpClient: (config: unknown) => {
      getFixtures: (dto: never) => Promise<unknown>;
      getLivescores: (dto: never) => Promise<unknown>;
      getFixtureMarkets: (dto: never) => Promise<unknown>;
      getEvents: (dto: never) => Promise<unknown>;
    };
  };
  FixturesSubscriptionRequestDto: new (data?: unknown) => { fixtures: number[] };
  StatusResponseBody: unknown;
} {
  const require = createRequire(import.meta.url);
  return require(TRADE360_SDK_PACKAGE);
}
