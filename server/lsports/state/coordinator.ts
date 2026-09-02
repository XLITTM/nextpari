import { planSnapshotRequests } from './plan.js';
import { readHeader } from './parse.js';
import type { LsportsSnapshotPlanItem, LsportsSnapshotRateLimiter } from './rateLimit.js';
import { LsportsRecoveryBuffer } from './recovery.js';
import { LsportsInPlayStore } from './store.js';
import type { LsportsRecoveryMode } from './types.js';

export type LsportsSnapshotPlanner = (input: {
  mode: LsportsRecoveryMode;
  lastHealthyHeartbeatServerTimestamp?: number | null;
}) => LsportsSnapshotPlanItem[];

/**
 * Injected I/O for the recovery coordinator. Tests supply fakes; this
 * module does not open RMQ, call Distribution/Start, or hit snapshot HTTP.
 */
export interface LsportsRecoveryIo {
  sleep: (ms: number) => Promise<void>;
  fetchSnapshot: (req: LsportsSnapshotPlanItem) => Promise<unknown>;
}

export interface LsportsRecoveryCoordinatorOptions {
  store: LsportsInPlayStore;
  buffer: LsportsRecoveryBuffer;
  limiter: LsportsSnapshotRateLimiter;
  io: LsportsRecoveryIo;
  now?: () => number;
  lastHealthyHeartbeatServerTimestamp?: number | null;
  /** Defaults to InPlay GetFixtures/GetScores/GetFixtureMarkets. PreMatch injects its own plan. */
  planSnapshots?: LsportsSnapshotPlanner;
}

/**
 * Official InPlay recovery (after LSports 10K auto-purge/disable):
 * The shadow bridge POSTs Distribution/Start and connects RMQ/buffering
 * before this cycle. This class then: snapshots → apply → replay → LIVE.
 * LIVE persists Type 32 Header.ServerTimestamp. It does not Start/Stop
 * distribution and does not connect to betting.
 */
export class LsportsRecoveryCoordinator {
  private mode: LsportsRecoveryMode;
  private lastHealthyHeartbeatServerTimestamp: number | null;
  private readonly store: LsportsInPlayStore;
  private readonly buffer: LsportsRecoveryBuffer;
  private readonly limiter: LsportsSnapshotRateLimiter;
  private readonly io: LsportsRecoveryIo;
  private readonly now: () => number;
  private readonly planSnapshots: LsportsSnapshotPlanner;

  constructor(options: LsportsRecoveryCoordinatorOptions) {
    this.store = options.store;
    this.buffer = options.buffer;
    this.limiter = options.limiter;
    this.io = options.io;
    this.now = options.now ?? Date.now;
    this.planSnapshots = options.planSnapshots ?? planSnapshotRequests;
    this.lastHealthyHeartbeatServerTimestamp = options.lastHealthyHeartbeatServerTimestamp
      ?? options.store.getLastHeartbeatServerTimestamp();
    this.mode = this.lastHealthyHeartbeatServerTimestamp == null
      ? 'COLD_START'
      : 'RECOVERY_WITH_HEARTBEAT';
  }

  getMode(): LsportsRecoveryMode {
    return this.mode;
  }

  isBuffering(): boolean {
    return this.buffer.isBuffering();
  }

  getLastHealthyHeartbeatServerTimestamp(): number | null {
    return this.lastHealthyHeartbeatServerTimestamp;
  }

  planCurrentSnapshots(): LsportsSnapshotPlanItem[] {
    if (this.mode === 'LIVE') return [];
    return this.planSnapshots({
      mode: this.mode,
      lastHealthyHeartbeatServerTimestamp: this.lastHealthyHeartbeatServerTimestamp,
    });
  }

  noteHeartbeat(payload: unknown, receivedAt = this.now()): void {
    this.store.ingestHeartbeat(payload, receivedAt);
    const serverTimestamp = readHeader(payload).serverTimestamp;
    if (serverTimestamp != null) {
      this.lastHealthyHeartbeatServerTimestamp = serverTimestamp;
    }
  }

  onRmq(payload: unknown, receivedAt = this.now()): void {
    if (this.buffer.isBuffering() || this.mode !== 'LIVE') {
      this.buffer.append(payload, receivedAt);
      if (readHeader(payload).type === 32) this.noteHeartbeat(payload, receivedAt);
      return;
    }
    this.store.ingestRmq(payload, { receivedAt });
    if (readHeader(payload).type === 32) this.noteHeartbeat(payload, receivedAt);
  }

  async runColdStart(): Promise<void> {
    this.mode = 'COLD_START';
    await this.runRecoveryCycle();
  }

  async runRecoveryWithHeartbeat(): Promise<void> {
    this.mode = 'RECOVERY_WITH_HEARTBEAT';
    await this.runRecoveryCycle();
  }

  async recover(): Promise<void> {
    this.mode = this.lastHealthyHeartbeatServerTimestamp == null
      ? 'COLD_START'
      : 'RECOVERY_WITH_HEARTBEAT';
    await this.runRecoveryCycle();
  }

  private async runRecoveryCycle(): Promise<void> {
    this.buffer.beginBuffering();
    const plan = this.planSnapshots({
      mode: this.mode === 'LIVE' ? 'COLD_START' : this.mode,
      lastHealthyHeartbeatServerTimestamp: this.lastHealthyHeartbeatServerTimestamp,
    });
    let snapshotRequestedAt: number | null = null;
    const snapshots: { fixtures?: unknown; scores?: unknown; markets?: unknown } = {};
    for (const item of plan) {
      let delay = this.limiter.requiredDelayMs(item);
      while (delay > 0) {
        await this.io.sleep(delay);
        delay = this.limiter.requiredDelayMs(item);
      }
      if (snapshotRequestedAt == null) snapshotRequestedAt = this.now();
      const payload = await this.io.fetchSnapshot(item);
      this.limiter.recordDispatch(item);
      if (item.endpoint === 'GetFixtures') snapshots.fixtures = payload;
      else if (item.endpoint === 'GetScores') snapshots.scores = payload;
      else snapshots.markets = payload;
    }
    this.buffer.applySnapshot({
      ...snapshots,
      snapshotRequestedAt: snapshotRequestedAt ?? this.now(),
    });
    this.buffer.replayBuffered();
    this.buffer.endBuffering();
    this.mode = 'LIVE';
  }
}
