import { readHeader } from '../state/parse.js';
import type { LsportsRecoveryCoordinator } from '../state/coordinator.js';
import type { LsportsInPlayStore } from '../state/store.js';
import type { LsportsFeedHealth } from '../state/types.js';
import { buildLsportsBrowserPayload, type LsportsBrowserFeed } from './payload.js';
import type { LsportsDistributionSnapshot } from './status.js';

const MEANINGFUL_TYPES = new Set([1, 2, 3, 31, 35]);

export const LSPORTS_SHADOW_COALESCE_MS = 400;
export const LSPORTS_SHADOW_HEALTH_POLL_MS = 1_000;

export interface LsportsDisplayBridgeOptions {
  store: LsportsInPlayStore;
  coordinator?: LsportsRecoveryCoordinator;
  now?: () => number;
  coalesceMs?: number;
  onPublish?: (payload: LsportsBrowserFeed) => void;
}

/**
 * Display-only publisher. Applies RMQ through the existing store/coordinator,
 * then republishes the full adapted football set. No wallet/payout logic.
 */
export class LsportsDisplayBridge {
  private readonly store: LsportsInPlayStore;
  private readonly coordinator?: LsportsRecoveryCoordinator;
  private readonly now: () => number;
  private readonly coalesceMs: number;
  private readonly onPublish?: (payload: LsportsBrowserFeed) => void;
  private payload: LsportsBrowserFeed;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHealth: LsportsFeedHealth;
  private distribution: LsportsDistributionSnapshot | null = null;
  private readonly listeners = new Set<(payload: LsportsBrowserFeed) => void>();

  constructor(options: LsportsDisplayBridgeOptions) {
    this.store = options.store;
    this.coordinator = options.coordinator;
    this.now = options.now ?? Date.now;
    this.coalesceMs = options.coalesceMs ?? LSPORTS_SHADOW_COALESCE_MS;
    this.onPublish = options.onPublish;
    this.payload = buildLsportsBrowserPayload(this.store, this.now(), this.distribution);
    this.lastHealth = this.payload.health;
  }

  getPayload(): LsportsBrowserFeed {
    return this.payload;
  }

  subscribe(listener: (payload: LsportsBrowserFeed) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
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

  noteDistributionStatus(snapshot: LsportsDistributionSnapshot): LsportsBrowserFeed {
    this.distribution = snapshot;
    return this.publishNow();
  }

  refreshHealth(): void {
    const health = buildLsportsBrowserPayload(this.store, this.now(), this.distribution).health;
    if (health !== this.lastHealth) this.publishNow();
  }

  publishNow(): LsportsBrowserFeed {
    if (this.publishTimer != null) {
      clearTimeout(this.publishTimer);
      this.publishTimer = null;
    }
    this.payload = buildLsportsBrowserPayload(this.store, this.now(), this.distribution);
    this.lastHealth = this.payload.health;
    for (const listener of this.listeners) listener(this.payload);
    this.onPublish?.(this.payload);
    return this.payload;
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
