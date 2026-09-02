import type { LsportsOutcomeSettlement } from './settlement.js';

export const LSPORTS_HEARTBEAT_STALE_MS = 12_000;

export type LsportsRecoveryMode = 'COLD_START' | 'RECOVERY_WITH_HEARTBEAT' | 'LIVE';
export type LsportsFeedHealth = 'HEALTHY' | 'STALE' | 'UNKNOWN';
export type LsportsIngestSource =
  | 'snapshot-fixtures'
  | 'snapshot-scores'
  | 'snapshot-markets'
  | 'rmq-1'
  | 'rmq-2'
  | 'rmq-3'
  | 'rmq-31'
  | 'rmq-32'
  | 'rmq-35';

export interface LsportsHeaderMeta {
  type: number | null;
  msgSeq: number | null;
  msgGuid: string | null;
  serverTimestamp: number | null;
  creationDate: string | null;
}

export interface LsportsMarketRecord {
  key: string;
  marketId: string | number | null;
  line: string;
  payload: Record<string, unknown>;
  lastUpdate: string | null;
  settlements: Map<string, LsportsOutcomeSettlement>;
}

export interface LsportsFixtureState {
  fixtureId: number;
  fixture: Record<string, unknown> | null;
  livescore: Record<string, unknown> | null;
  livescoreSource: {
    source: LsportsIngestSource | null;
    serverTimestamp: number | null;
    lastUpdate: string | null;
  };
  markets: Map<string, LsportsMarketRecord>;
  active: boolean;
  lastSource: LsportsIngestSource | null;
}

export interface LsportsKeepAliveDiscrepancy {
  activeInLsportsAbsentLocal: number[];
  localActiveAbsentFromKeepAlive: number[];
}

export interface LsportsStateMetrics {
  fixtureCount: number;
  activeFixtureCount: number;
  marketCount: number;
  outcomeCount: number;
  lastHeartbeatTimestamp: number | null;
  bufferDepth: number;
  discrepanciesCount: number;
}

export interface LsportsBufferedMessage {
  receivedAt: number;
  payload: unknown;
}

export interface LsportsApplyOptions {
  receivedAt?: number;
  snapshotRequestedAt?: number | null;
}
