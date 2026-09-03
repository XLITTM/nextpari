import { resolveLsportsRmqConfig, type LsportsFlow } from '../config.js';
import { LSPORTS_FOOTBALL_SPORT_ID } from '../snapshot.js';
import type { LsportsSnapshotPlanItem } from '../state/rateLimit.js';
import { createSdkSafeLogger } from './logger.js';
import { loadTrade360Sdk, type Trade360Sdk } from './loadSdk.js';
import { LSPORTS_SDK_SNAPSHOT_API_BASE_URL } from './mqSettings.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function snapshotDto(item: LsportsSnapshotPlanItem): Record<string, unknown> {
  const dto: Record<string, unknown> = {
    sports: [LSPORTS_FOOTBALL_SPORT_ID],
  };
  if (!item.unfiltered && item.timestamp != null) dto.timestamp = item.timestamp;
  return dto;
}

/**
 * SDK snapshot clients return transformed entities, not raw Header/Body JSON.
 * Wrap them so the existing coordinator/store parsers (which already accept
 * camelCase fixtureId/events) keep LastUpdate/newest-wins semantics.
 */
export function wrapSdkSnapshotResult(result: unknown): unknown {
  if (result == null) return { Header: { Type: 36 }, Body: [] };
  const root = asRecord(result);
  if (root && (root.Header != null || root.header != null || root.Body != null || root.body != null)) {
    return result;
  }
  const body = Array.isArray(result) ? result : [result];
  return { Header: { Type: 36 }, Body: body };
}

export interface LsportsSdkSnapshotDeps {
  loadSdk?: () => Trade360Sdk;
}

export async function fetchSnapshotBodyViaSdk(
  flow: LsportsFlow,
  item: LsportsSnapshotPlanItem,
  env: NodeJS.ProcessEnv = process.env,
  deps: LsportsSdkSnapshotDeps = {},
): Promise<unknown> {
  const config = resolveLsportsRmqConfig(flow, env);
  const sdk = (deps.loadSdk ?? loadTrade360Sdk)();
  const factory = new sdk.SnapshotApiFactory();
  const http = {
    restApiBaseUrl: LSPORTS_SDK_SNAPSHOT_API_BASE_URL,
    packageCredentials: {
      packageId: config.packageId,
      username: config.username,
      password: config.password,
    },
    logger: createSdkSafeLogger([config.username, config.password]) as never,
  };
  const client = flow === 'inplay'
    ? factory.createSnapshotApiInPlayHttpClient(http)
    : factory.createSnapshotApiPrematchHttpClient(http);
  const dto = snapshotDto(item) as never;
  let result: unknown;
  if (item.endpoint === 'GetFixtures') result = await client.getFixtures(dto);
  else if (item.endpoint === 'GetScores') result = await client.getLivescores(dto);
  else if (item.endpoint === 'GetFixtureMarkets') result = await client.getFixtureMarkets(dto);
  else result = await client.getEvents(dto);
  return wrapSdkSnapshotResult(result);
}
