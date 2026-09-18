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

function sortKey(part: { sourceKind: string; sourceCashierId: string | null }): string {
  return `${part.sourceKind}:${part.sourceCashierId ?? ''}`;
}

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
  const minor = Number(text);
  if (!Number.isSafeInteger(minor)) {
    throw new Error('CURRENCY_AMOUNT_SCALE_INVALID');
  }
  return minor;
}

export function allocateLargestRemainder(
  parts: AttributionWeight[],
  amountMinor: number,
): AttributionAllocation[] {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return [];
  const total = parts.reduce((sum, part) => sum + part.weightMinor, 0);
  if (total <= 0) {
    throw new Error('ATTRIBUTION_NO_SOURCE');
  }
  const ranked = parts
    .map((part) => {
      const floorMinor = Math.trunc((amountMinor * part.weightMinor) / total);
      const remainderMinor = (amountMinor * part.weightMinor) % total;
      return { ...part, floorMinor, remainderMinor };
    })
    .sort((a, b) => {
      if (b.remainderMinor !== a.remainderMinor) return b.remainderMinor - a.remainderMinor;
      return sortKey(a).localeCompare(sortKey(b));
    });
  const extra = amountMinor - ranked.reduce((sum, part) => sum + part.floorMinor, 0);
  return ranked
    .map((part, index) => {
      const allocatedMinor = part.floorMinor + (index < extra ? 1 : 0);
      return {
        sourceKind: part.sourceKind,
        sourceCashierId: part.sourceCashierId,
        allocatedMinor,
      };
    })
    .filter((part) => part.allocatedMinor > 0)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
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
  selectedCashierId: string;
}): AttributionAllocation[] {
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

export const PLAYER_REVIEW_NOTICE = 'Заявка на вывод находится на рассмотрении.';
export const PLAYER_REJECT_PROPORTION_NOTICE =
  'Вывод отклонён. Сумма вывода должна быть пропорциональна сумме пополнений через выбранную кассу. Для дополнительной информации обратитесь в поддержку.';
