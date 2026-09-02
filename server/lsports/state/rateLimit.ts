export const LSPORTS_SNAPSHOT_GLOBAL_MIN_INTERVAL_MS = 1_100;
export const LSPORTS_SNAPSHOT_UNFILTERED_MIN_INTERVAL_MS = 15_000;

export type LsportsSnapshotEndpoint = 'GetFixtures' | 'GetScores' | 'GetFixtureMarkets';

export interface LsportsSnapshotPlanItem {
  endpoint: LsportsSnapshotEndpoint;
  timestamp?: number;
  unfiltered: boolean;
}

export class LsportsSnapshotRateLimiter {
  private lastGlobalAt: number | null = null;
  private lastUnfilteredAt = new Map<LsportsSnapshotEndpoint, number>();

  constructor(private readonly now: () => number = Date.now) {}

  requiredDelayMs(item: LsportsSnapshotPlanItem, at = this.now()): number {
    let wait = 0;
    if (this.lastGlobalAt != null) {
      wait = Math.max(wait, LSPORTS_SNAPSHOT_GLOBAL_MIN_INTERVAL_MS - (at - this.lastGlobalAt));
    }
    if (item.unfiltered) {
      const previous = this.lastUnfilteredAt.get(item.endpoint);
      if (previous != null) {
        wait = Math.max(wait, LSPORTS_SNAPSHOT_UNFILTERED_MIN_INTERVAL_MS - (at - previous));
      }
    }
    return Math.max(0, wait);
  }

  canDispatch(item: LsportsSnapshotPlanItem, at = this.now()): boolean {
    return this.requiredDelayMs(item, at) === 0;
  }

  recordDispatch(item: LsportsSnapshotPlanItem, at = this.now()): void {
    this.lastGlobalAt = at;
    if (item.unfiltered) this.lastUnfilteredAt.set(item.endpoint, at);
  }
}
