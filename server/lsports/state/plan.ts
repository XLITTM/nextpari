import type { LsportsSnapshotPlanItem } from './rateLimit.js';
import type { LsportsRecoveryMode } from './types.js';

export const LSPORTS_SNAPSHOT_ENDPOINTS = [
  'GetFixtures',
  'GetScores',
  'GetFixtureMarkets',
] as const;

/** PreMatch cold-start/recovery: fixtures + markets (scores optional for line). */
export const LSPORTS_PREMATCH_SNAPSHOT_ENDPOINTS = [
  'GetFixtures',
  'GetFixtureMarkets',
] as const;

export function planSnapshotRequests(input: {
  mode: LsportsRecoveryMode;
  lastHealthyHeartbeatServerTimestamp?: number | null;
}): LsportsSnapshotPlanItem[] {
  if (input.mode === 'LIVE') return [];
  if (input.mode === 'RECOVERY_WITH_HEARTBEAT') {
    const timestamp = input.lastHealthyHeartbeatServerTimestamp;
    if (timestamp == null) {
      return LSPORTS_SNAPSHOT_ENDPOINTS.map((endpoint) => ({ endpoint, unfiltered: true }));
    }
    return LSPORTS_SNAPSHOT_ENDPOINTS.map((endpoint) => ({
      endpoint,
      timestamp,
      unfiltered: false,
    }));
  }
  return LSPORTS_SNAPSHOT_ENDPOINTS.map((endpoint) => ({ endpoint, unfiltered: true }));
}

export function planPrematchSnapshotRequests(input: {
  mode: LsportsRecoveryMode;
  lastHealthyHeartbeatServerTimestamp?: number | null;
}): LsportsSnapshotPlanItem[] {
  if (input.mode === 'LIVE') return [];
  if (input.mode === 'RECOVERY_WITH_HEARTBEAT') {
    const timestamp = input.lastHealthyHeartbeatServerTimestamp;
    if (timestamp == null) {
      return LSPORTS_PREMATCH_SNAPSHOT_ENDPOINTS.map((endpoint) => ({ endpoint, unfiltered: false }));
    }
    return LSPORTS_PREMATCH_SNAPSHOT_ENDPOINTS.map((endpoint) => ({
      endpoint,
      timestamp,
      unfiltered: false,
    }));
  }
  return LSPORTS_PREMATCH_SNAPSHOT_ENDPOINTS.map((endpoint) => ({ endpoint, unfiltered: false }));
}

export function buildPlannedSnapshotBody(
  item: LsportsSnapshotPlanItem,
  packageId: number,
  userName: string,
  password: string,
) {
  const body: {
    packageId: number;
    userName: string;
    password: string;
    timestamp?: number;
  } = { packageId, userName, password };
  if (!item.unfiltered && item.timestamp != null) {
    body.timestamp = item.timestamp;
  }
  return body;
}
