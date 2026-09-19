export type AttributionKind = 'cashier' | 'treasury' | 'house' | 'legacy' | 'bonus';

export interface AttributionWeight {
  sourceKind: AttributionKind;
  sourceCashierId: string | null;
  weightMinor: number;
}

export interface AttributionAllocation {
  sourceKind: AttributionKind;
  sourceCashierId: string | null;
  allocatedMinor: number;
}

export interface AttributionWeightExact {
  sourceKind: AttributionKind;
  sourceCashierId: string | null;
  weightMinor: bigint;
}

export interface AttributionAllocationExact {
  sourceKind: AttributionKind;
  sourceCashierId: string | null;
  allocatedMinor: bigint;
}

function sortKey(part: { sourceKind: string; sourceCashierId: string | null }): string {
  return `${part.sourceKind}:${part.sourceCashierId ?? ''}`;
}

/** Fixture-scale helper only. Production minor-unit arithmetic is PostgreSQL NUMERIC(40,0). */
export function amountToMinor(amount: string, scale: 0 | 2): number {
  if (!/^-?\d+(\.\d+)?$/.test(amount)) {
    throw new Error('CURRENCY_AMOUNT_SCALE_INVALID');
  }
  const [whole, frac = ''] = amount.split('.');
  if (frac.length > scale) {
    throw new Error('CURRENCY_AMOUNT_SCALE_INVALID');
  }
  const padded = (frac + '0'.repeat(scale)).slice(0, scale);
  const text = scale === 0 ? whole : `${whole}${padded}`;
  if (!/^-?\d+$/.test(text) || text.replace('-', '').length > 15) {
    throw new Error('CURRENCY_AMOUNT_SCALE_INVALID');
  }
  const minor = Number(text);
  if (!Number.isSafeInteger(minor)) {
    throw new Error('CURRENCY_AMOUNT_SCALE_INVALID');
  }
  return minor;
}

/**
 * Exact Hamilton allocation in integer minor units.
 * Mirrors private.attribution_allocate_largest_remainder (NUMERIC, trunc, no float).
 * JS Number is not used and is not production money safety.
 */
export function allocateLargestRemainderExact(
  parts: AttributionWeightExact[],
  amountMinor: bigint,
): AttributionAllocationExact[] {
  if (amountMinor <= 0n) return [];
  const total = parts.reduce((sum, part) => sum + part.weightMinor, 0n);
  if (total <= 0n) {
    throw new Error('ATTRIBUTION_NO_SOURCE');
  }
  const ranked = parts
    .map((part) => {
      const product = amountMinor * part.weightMinor;
      const floorMinor = product / total;
      const remainderMinor = product - floorMinor * total;
      return { ...part, floorMinor, remainderMinor };
    })
    .sort((a, b) => {
      if (b.remainderMinor !== a.remainderMinor) {
        return b.remainderMinor > a.remainderMinor ? 1 : -1;
      }
      return sortKey(a).localeCompare(sortKey(b));
    });
  let extra = amountMinor - ranked.reduce((sum, part) => sum + part.floorMinor, 0n);
  return ranked
    .map((part) => {
      const bonus = extra > 0n ? 1n : 0n;
      if (extra > 0n) extra -= 1n;
      return {
        sourceKind: part.sourceKind,
        sourceCashierId: part.sourceCashierId,
        allocatedMinor: part.floorMinor + bonus,
      };
    })
    .filter((part) => part.allocatedMinor > 0n)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/** Small-fixture wrapper. Do not use JS Number for values that can exceed 2^53-1. */
export function allocateLargestRemainder(
  parts: AttributionWeight[],
  amountMinor: number,
): AttributionAllocation[] {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return [];
  if (!parts.every((part) => Number.isSafeInteger(part.weightMinor))) {
    throw new Error('ATTRIBUTION_JS_NUMBER_UNSAFE');
  }
  return allocateLargestRemainderExact(
    parts.map((part) => ({
      sourceKind: part.sourceKind,
      sourceCashierId: part.sourceCashierId,
      weightMinor: BigInt(part.weightMinor),
    })),
    BigInt(amountMinor),
  ).map((part) => ({
    sourceKind: part.sourceKind,
    sourceCashierId: part.sourceCashierId,
    allocatedMinor: Number(part.allocatedMinor),
  }));
}

export function consumeAvailable(
  buckets: AttributionWeight[],
  amountMinor: number,
): AttributionAllocation[] {
  return allocateLargestRemainder(
    buckets.filter((part) => part.weightMinor > 0),
    amountMinor,
  );
}

export function creditFromSnapshot(
  snapshot: AttributionAllocation[],
  creditMinor: number,
): AttributionAllocation[] {
  return allocateLargestRemainder(
    snapshot.map((part) => ({
      sourceKind: part.sourceKind,
      sourceCashierId: part.sourceCashierId,
      weightMinor: part.allocatedMinor,
    })),
    creditMinor,
  );
}

export function classifyCashWithdrawal(args: {
  requestedMinor: number;
  selectedCashierAvailableMinor: number;
  state: 'not_initialized' | 'active' | 'inconsistent';
}): 'clean' | 'review' {
  if (args.state !== 'active') return 'review';
  if (args.requestedMinor > args.selectedCashierAvailableMinor) return 'review';
  return 'clean';
}

export function reserveWithdrawal(args: {
  buckets: AttributionWeight[];
  requestedMinor: number;
  selectedCashierId: string | null;
}): AttributionAllocation[] {
  if (args.selectedCashierId == null) {
    return allocateLargestRemainder(
      args.buckets.filter((part) => part.weightMinor > 0),
      args.requestedMinor,
    );
  }
  const selected = args.buckets.find(
    (part) => part.sourceKind === 'cashier' && part.sourceCashierId === args.selectedCashierId,
  );
  const takeSelected = Math.min(selected?.weightMinor ?? 0, args.requestedMinor);
  const rest = args.requestedMinor - takeSelected;
  const others = args.buckets.filter(
    (part) => !(part.sourceKind === 'cashier' && part.sourceCashierId === args.selectedCashierId)
      && part.weightMinor > 0,
  );
  const restParts = rest > 0 ? allocateLargestRemainder(others, rest) : [];
  const parts: AttributionAllocation[] = [];
  if (takeSelected > 0) {
    parts.push({
      sourceKind: 'cashier',
      sourceCashierId: args.selectedCashierId,
      allocatedMinor: takeSelected,
    });
  }
  return [...parts, ...restParts].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

export function applyHoldParts(
  available: AttributionWeight[],
  parts: AttributionAllocation[],
): { available: AttributionWeight[]; reserved: AttributionAllocation[] } {
  const next = available.map((bucket) => ({ ...bucket }));
  for (const part of parts) {
    const bucket = next.find(
      (row) => row.sourceKind === part.sourceKind && row.sourceCashierId === part.sourceCashierId,
    );
    if (!bucket || bucket.weightMinor < part.allocatedMinor) {
      throw new Error('ATTRIBUTION_BUCKET_UNDERFLOW');
    }
    bucket.weightMinor -= part.allocatedMinor;
  }
  return { available: next, reserved: parts };
}

export const PLAYER_REVIEW_NOTICE = 'Заявка на вывод находится на рассмотрении.';
export const PLAYER_REJECT_PROPORTION_NOTICE =
  'Вывод отклонён. Сумма вывода должна быть пропорциональна сумме пополнений через выбранную кассу. Для дополнительной информации обратитесь в поддержку.';

export interface AttributionLedgerIdentity {
  entryKey: string;
  walletId: string;
  currency: string;
  sourceKind: AttributionKind;
  sourceCashierId: string | null;
  availableDeltaMinor: bigint;
  reservedDeltaMinor: bigint;
  referenceType: string | null;
  referenceId: string | null;
  walletLedgerEntryKey: string | null;
}

export type AttributionLedgerReplayDecision = 'insert' | 'replay' | 'conflict';

function notDistinctFrom(left: string | bigint | null, right: string | bigint | null): boolean {
  return left === right;
}

/** Mirrors private.apply_fund_attribution_delta entry_key replay. Metadata is not bound. */
export function decideAttributionLedgerReplay(
  existing: AttributionLedgerIdentity | null,
  incoming: AttributionLedgerIdentity,
): AttributionLedgerReplayDecision {
  if (existing == null || existing.entryKey !== incoming.entryKey) {
    return 'insert';
  }
  const samePayload =
    notDistinctFrom(existing.walletId, incoming.walletId)
    && notDistinctFrom(existing.currency, incoming.currency)
    && notDistinctFrom(existing.sourceKind, incoming.sourceKind)
    && notDistinctFrom(existing.sourceCashierId, incoming.sourceCashierId)
    && notDistinctFrom(existing.availableDeltaMinor, incoming.availableDeltaMinor)
    && notDistinctFrom(existing.reservedDeltaMinor, incoming.reservedDeltaMinor)
    && notDistinctFrom(existing.referenceType, incoming.referenceType)
    && notDistinctFrom(existing.referenceId, incoming.referenceId)
    && notDistinctFrom(existing.walletLedgerEntryKey, incoming.walletLedgerEntryKey);
  return samePayload ? 'replay' : 'conflict';
}
