import { readHeader } from '../state/parse.js';
import type { LsportsRecoveryCoordinator } from '../state/coordinator.js';
import type { LsportsInPlayStore } from '../state/store.js';
import type { LsportsFeedHealth, LsportsRecoveryMode } from '../state/types.js';
import type { LsportsDistributionSnapshot } from '../bridge/status.js';
import { buildLsportsPrematchPayload, type LsportsPrematchFeed } from './payload.js';

const MEANINGFUL_TYPES = new Set([1, 2, 3, 31, 35]);

export const LSPORTS_PREMATCH_COALESCE_MS = 400;
export const LSPORTS_PREMATCH_HEALTH_POLL_MS = 1_000;

export interface LsportsPrematchBridgeOptions {
  store: LsportsInPlayStore;
  coordinator?: LsportsRecoveryCoordinator;
  packageId?: number;
  now?: () => number;
  coalesceMs?: number;
  consumerConnected?: () => boolean;
  lastMessageAt?: () => number | null;
}

export class LsportsPrematchDisplayBridge {
  private readonly store: LsportsInPlayStore;
  private readonly coordinator?: LsportsRecoveryCoordinator;
  private readonly now: () => number;
  private readonly coalesceMs: number;
  private readonly packageId: number;
  private readonly consumerConnected: () => boolean;
  private readonly lastMessageAt: () => number | null;
  private payload: LsportsPrematchFeed;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHealth: LsportsFeedHealth;
  private distribution: LsportsDistributionSnapshot | null = null;

  constructor(options: LsportsPrematchBridgeOptions) {
    this.store = options.store;
    this.coordinator = options.coordinator;
    this.now = options.now ?? Date.now;
    this.coalesceMs = options.coalesceMs ?? LSPORTS_PREMATCH_COALESCE_MS;
    this.packageId = options.packageId ?? 4352;
    this.consumerConnected = options.consumerConnected ?? (() => false);
    this.lastMessageAt = options.lastMessageAt ?? (() => null);
    this.payload = this.buildPayload();
    this.lastHealth = this.payload.health;
  }

  getPayload(): LsportsPrematchFeed {
    return this.payload;
  }

  getRecoveryMode(): LsportsRecoveryMode | null {
    return this.coordinator?.getMode() ?? null;
  }

  isBuffering(): boolean {
    return this.coordinator?.isBuffering() ?? false;
  }

  handleRmq(payload: unknown): void {
    if (this.coordinator) this.coordinator.onRmq(payload, this.now());
    else this.store.ingestRmq(payload, { receivedAt: this.now() });
    const type = readHeader(payload).type;
    if (type != null && MEANINGFUL_TYPES.has(type)) this.schedulePublish();
    this.refreshHealth();
  }

  markRecoveryComplete(): void {
    this.publishNow();
  }

  noteDistributionStatus(snapshot: LsportsDistributionSnapshot): LsportsPrematchFeed {
    this.distribution = snapshot;
    return this.publishNow();
  }

  refreshHealth(): void {
    const health = this.buildPayload().health;
    if (health !== this.lastHealth) this.publishNow();
  }

  publishNow(): LsportsPrematchFeed {
    if (this.publishTimer != null) {
      clearTimeout(this.publishTimer);
      this.publishTimer = null;
    }
    this.payload = this.buildPayload();
    this.lastHealth = this.payload.health;
    return this.payload;
  }

  private buildPayload(): LsportsPrematchFeed {
    return buildLsportsPrematchPayload(this.store, this.now(), {
      distribution: this.distribution,
      recovery: {
        mode: this.getRecoveryMode(),
        buffering: this.isBuffering(),
      },
      consumerConnected: this.consumerConnected(),
      lastMessageAt: this.lastMessageAt(),
      packageId: this.packageId,
    });
  }

  private schedulePublish(): void {
    if (this.coalesceMs <= 0) {
      this.publishNow();
      return;
    }
    if (this.publishTimer != null) return;
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null;
      this.publishNow();
    }, this.coalesceMs);
  }
}
