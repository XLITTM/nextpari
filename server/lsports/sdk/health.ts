import type { LsportsFlow } from '../config.js';
import { TRADE360_SDK_NODE_REQUIREMENT, TRADE360_SDK_PACKAGE, TRADE360_SDK_VERSION } from './constants.js';
import { resolveLsportsTransport } from './mode.js';
import { sdkShadowFor, type LsportsSdkShadowSnapshot } from './shadow.js';
import { canonicalWriterSnapshot } from './writer.js';

export interface LsportsSdkHealth {
  package: string;
  version: string;
  nodeRequirement: string;
  transport: 'direct' | 'sdk';
  shadow: boolean;
  writer: Record<LsportsFlow, 'direct' | 'sdk' | null>;
  rmqConsumeInShadow: false;
  feedStartStopsDistribution: false;
  fixtureOrdering: {
    sdkMethod: 'CustomersApiFactory.createSubscriptionHttpClient().subscribeByFixtures';
    autoOnStartup: false;
  };
  snapshot: {
    sdkFactory: 'SnapshotApiFactory';
    usedWhenTransportIsSdk: true;
    coordinatorUnchanged: true;
  };
  inplay: LsportsSdkShadowSnapshot;
  prematch: LsportsSdkShadowSnapshot;
}

export function buildSdkHealthDiagnostics(env: NodeJS.ProcessEnv = process.env): LsportsSdkHealth {
  const mode = resolveLsportsTransport(env);
  return {
    package: TRADE360_SDK_PACKAGE,
    version: TRADE360_SDK_VERSION,
    nodeRequirement: TRADE360_SDK_NODE_REQUIREMENT,
    transport: mode.transport,
    shadow: mode.shadow,
    writer: canonicalWriterSnapshot(),
    rmqConsumeInShadow: false,
    feedStartStopsDistribution: false,
    fixtureOrdering: {
      sdkMethod: 'CustomersApiFactory.createSubscriptionHttpClient().subscribeByFixtures',
      autoOnStartup: false,
    },
    snapshot: {
      sdkFactory: 'SnapshotApiFactory',
      usedWhenTransportIsSdk: true,
      coordinatorUnchanged: true,
    },
    inplay: sdkShadowFor('inplay').snapshot(),
    prematch: sdkShadowFor('prematch').snapshot(),
  };
}
