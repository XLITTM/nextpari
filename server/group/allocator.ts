import type { BrandCode } from './catalog.js';
import { GroupControlError } from './errors.js';
import {
  GLOBAL_PUBLIC_ID_MAX,
  assertPublicId,
  formatGlobalPlayerId,
  planGroupCounter,
  publicIdNumeric,
} from './ids.js';

export interface PlayerIdReservation {
  publicId: string;
  brandCode: BrandCode;
  source: 'legacy' | 'allocation';
  idempotencyKey: string | null;
}

const IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * In-memory model of the group control-plane allocator.
 * It does not open a database, and it has no local fallback.
 */
export class CentralPlayerIdAllocator {
  private nextValue: bigint | null = null;
  private readonly byExact = new Map<string, PlayerIdReservation>();
  private readonly byNumeric = new Map<string, string>();
  private readonly idempotency = new Map<string, { brandCode: BrandCode; publicId: string }>();
  private tail: Promise<void> = Promise.resolve();
  private readonly available: () => boolean;

  constructor(available: () => boolean = () => true) {
    this.available = available;
  }

  reservedIds(): string[] {
    return [...this.byExact.keys()];
  }

  snapshotNextValue(): bigint | null {
    return this.nextValue;
  }

  async reserveLegacy(publicIds: readonly string[], brandCode: BrandCode): Promise<void> {
    await this.exclusive(() => {
      for (const raw of publicIds) {
        const publicId = assertPublicId(raw);
        const numeric = publicIdNumeric(publicId).toString();
        const exact = this.byExact.get(publicId);
        const numericOwner = this.byNumeric.get(numeric);
        if (exact || numericOwner) {
          const current = exact ?? (numericOwner ? this.byExact.get(numericOwner) : undefined);
          if (
            !current
            || current.publicId !== publicId
            || current.brandCode !== brandCode
            || current.source !== 'legacy'
          ) {
            throw new GroupControlError('PUBLIC_ID_ALREADY_RESERVED');
          }
          continue;
        }
        const reservation: PlayerIdReservation = {
          publicId,
          brandCode,
          source: 'legacy',
          idempotencyKey: null,
        };
        this.byExact.set(publicId, reservation);
        this.byNumeric.set(numeric, publicId);
      }
    });
  }

  /**
   * Sets the group counter from a read-only production counter value.
   * A second call with the same inputs is a no-op. A lower value is rejected.
   */
  async seedCounter(input: {
    productionNextValue: number;
    legacyPublicIds: readonly string[];
  }): Promise<bigint> {
    const planned = planGroupCounter(input);
    return this.exclusive(() => {
      if (this.nextValue == null) {
        this.nextValue = planned;
        return planned;
      }
      if (this.nextValue !== planned) throw new GroupControlError('COUNTER_REGRESSION');
      return this.nextValue;
    });
  }

  async allocate(input: { brandCode: BrandCode; idempotencyKey: string }): Promise<string> {
    const key = input.idempotencyKey.trim();
    if (!IDEMPOTENCY_RE.test(key)) throw new GroupControlError('IDEMPOTENCY_KEY_INVALID');
    return this.exclusive(() => {
      const prior = this.idempotency.get(key);
      if (prior) {
        if (prior.brandCode !== input.brandCode) throw new GroupControlError('IDEMPOTENCY_CONFLICT');
        return prior.publicId;
      }
      if (this.nextValue == null) throw new GroupControlError('COUNTER_NOT_SEEDED');
      let current = this.nextValue;
      while (current <= GLOBAL_PUBLIC_ID_MAX) {
        const publicId = formatGlobalPlayerId(current);
        const numeric = current.toString();
        if (!this.byExact.has(publicId) && !this.byNumeric.has(numeric)) {
          const reservation: PlayerIdReservation = {
            publicId,
            brandCode: input.brandCode,
            source: 'allocation',
            idempotencyKey: key,
          };
          this.byExact.set(publicId, reservation);
          this.byNumeric.set(numeric, publicId);
          this.idempotency.set(key, { brandCode: input.brandCode, publicId });
          this.nextValue = current + 1n;
          return publicId;
        }
        current += 1n;
      }
      throw new GroupControlError('PUBLIC_ID_SPACE_EXHAUSTED');
    });
  }

  private async exclusive<T>(fn: () => T): Promise<T> {
    const previous = this.tail;
    let release: () => void = () => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (!this.available()) throw new GroupControlError('CENTRAL_ALLOCATOR_UNAVAILABLE');
      return fn();
    } finally {
      release();
    }
  }
}
