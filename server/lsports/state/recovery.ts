import { LsportsInPlayStore } from './store.js';
import type { LsportsBufferedMessage } from './types.js';

/**
 * Recovery assumptions (documented for replay):
 * 1. beginBuffering() starts capturing RMQ arrival order.
 * 2. Snapshot HTTP is issued after buffering starts. Call applySnapshot()
 *    with snapshotRequestedAt = the moment the first snapshot request left.
 * 3. Snapshot bodies have no sequence number. They seed state first.
 * 4. replayBuffered() then applies RMQ in arrival order.
 * 5. Market/bet conflicts: if both sides have LastUpdate, later LastUpdate wins.
 * 6. If LastUpdate is absent, a buffered RMQ message wins only when
 *    receivedAt >= snapshotRequestedAt. Older buffered messages yield to snapshot.
 * 7. Type 2 livescore payloads usually have no LastUpdate; rule 6 applies.
 * 8. This buffer does not connect to Nextpari betting or /api/sports.
 */
export class LsportsRecoveryBuffer {
  private buffering = false;
  private messages: LsportsBufferedMessage[] = [];
  private snapshotRequestedAt: number | null = null;

  constructor(
    private readonly store: LsportsInPlayStore,
    private readonly now: () => number = Date.now,
  ) {}

  beginBuffering(): void {
    if (this.buffering) return;
    this.buffering = true;
    this.messages = [];
    this.snapshotRequestedAt = null;
    this.store.setBufferDepth(0);
  }

  append(payload: unknown, receivedAt = this.now()): void {
    if (!this.buffering) return;
    this.messages.push({ receivedAt, payload });
    this.store.setBufferDepth(this.messages.length);
  }

  applySnapshot(input: {
    fixtures?: unknown;
    scores?: unknown;
    markets?: unknown;
    snapshotRequestedAt?: number;
  }): void {
    this.snapshotRequestedAt = input.snapshotRequestedAt ?? this.now();
    const options = {
      receivedAt: this.snapshotRequestedAt,
      snapshotRequestedAt: this.snapshotRequestedAt,
    };
    if (input.fixtures) this.store.ingestFixturesSnapshot(input.fixtures);
    if (input.scores) this.store.ingestScoresSnapshot(input.scores, options);
    if (input.markets) this.store.ingestMarketsSnapshot(input.markets, options);
  }

  replayBuffered(): void {
    const snapshotRequestedAt = this.snapshotRequestedAt;
    for (const message of this.messages) {
      this.store.ingestRmq(message.payload, {
        receivedAt: message.receivedAt,
        snapshotRequestedAt,
      });
    }
  }

  endBuffering(): void {
    this.buffering = false;
    this.messages = [];
    this.store.setBufferDepth(0);
  }

  depth(): number {
    return this.messages.length;
  }

  isBuffering(): boolean {
    return this.buffering;
  }
}
