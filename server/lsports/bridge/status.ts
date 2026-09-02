import {
  getDistributionStatus,
  readDistributionConsumerCount,
  type LsportsDistributionCallDeps,
  type LsportsDistributionStatusResult,
} from '../distribution.js';
import type { LsportsFlow } from '../config.js';
import type { LsportsFeedHealth } from '../state/types.js';

export const LSPORTS_DISTRIBUTION_STATUS_POLL_MS = 5_000;
export const LSPORTS_QUEUE_DEPTH_WARNING = 500;

export interface LsportsDistributionSnapshot {
  distributionActive: boolean | null;
  consumerCount: number | null;
  numberMessagesInQueue: number | null;
  messagesPerSecond: number | null;
  polledAt: number;
}

export interface LsportsSanitizedDistributionDiagnostics {
  distributionActive: boolean | null;
  consumerCount: number | null;
  numberMessagesInQueue: number | null;
  messagesPerSecond: number | null;
  feedHealth: LsportsFeedHealth;
  lastHeartbeatAt: number | null;
  queueWarning: boolean;
}

export function snapshotFromDistributionStatus(
  result: LsportsDistributionStatusResult,
  now = Date.now(),
): LsportsDistributionSnapshot {
  return {
    distributionActive: result.isDistributionOn,
    consumerCount: readDistributionConsumerCount(result.body) ?? (
      typeof result.consumers === 'number' && Number.isFinite(result.consumers)
        ? result.consumers
        : Array.isArray(result.consumers) ? result.consumers.length : null
    ),
    numberMessagesInQueue: result.numberMessagesInQueue,
    messagesPerSecond: result.messagesPerSecond,
    polledAt: now,
  };
}

export function shouldWarnQueueDepth(queue: number | null | undefined): boolean {
  return queue != null && queue >= LSPORTS_QUEUE_DEPTH_WARNING;
}

export function sanitizeDistributionDiagnostics(
  snapshot: LsportsDistributionSnapshot | null,
  feedHealth: LsportsFeedHealth,
  lastHeartbeatAt: number | null,
): LsportsSanitizedDistributionDiagnostics {
  return {
    distributionActive: snapshot?.distributionActive ?? null,
    consumerCount: snapshot?.consumerCount ?? null,
    numberMessagesInQueue: snapshot?.numberMessagesInQueue ?? null,
    messagesPerSecond: snapshot?.messagesPerSecond ?? null,
    feedHealth,
    lastHeartbeatAt,
    queueWarning: shouldWarnQueueDepth(snapshot?.numberMessagesInQueue),
  };
}

export async function pollInPlayDistributionStatus(
  env: NodeJS.ProcessEnv = process.env,
  deps: LsportsDistributionCallDeps = {},
  flow: LsportsFlow = 'inplay',
): Promise<LsportsDistributionSnapshot> {
  const result = await getDistributionStatus(flow, env, { ...deps, verbose: false });
  return snapshotFromDistributionStatus(result);
}
