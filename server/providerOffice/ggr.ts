import { ProviderOfficeError } from './errors.js';
import { formatMinor, parseMinor } from './money.js';

export const ALLOCATION_METHOD = 'equal-distinct-sports';

export type SettlementClass =
  | 'winner'
  | 'loser'
  | 'half_won'
  | 'half_lost'
  | 'refund'
  | 'push'
  | 'cancelled';

export interface SportsBetFact {
  betId: string;
  brandCode: string;
  product: 'sports';
  currency: string;
  stake: string;
  /** Latest economic amount paid or payable to the player, after corrections. */
  payout: string;
  settlement: SettlementClass;
  status: 'settled' | 'cancelled';
  mode: 'single' | 'express';
  settledAt: string;
  testAccount: boolean;
  /** Informational only. Contractual GGR does not subtract this. */
  bonusCost?: string;
  sports: readonly string[];
}

export interface NativeTotals {
  currency: string;
  eligibleStakes: string;
  winnings: string;
  refundedStakes: string;
  cancelledStakes: string;
  settledBetCount: number;
  eligibleBetCount: number;
  wonCount: number;
  lostCount: number;
  refundCount: number;
  cancelledCount: number;
  ggr: string;
  margin: string | null;
}

export interface SportAllocationRow {
  sport: string;
  eligibleStakes: string;
  winnings: string;
  ggr: string;
}

export interface SportsbookComputation {
  totals: NativeTotals[];
  sports: {
    method: typeof ALLOCATION_METHOD;
    status: 'allocated' | 'SPORT_TAG_UNAVAILABLE';
    rows: SportAllocationRow[];
  };
}

const ELIGIBLE = new Set<SettlementClass>(['winner', 'loser', 'half_won', 'half_lost']);

/**
 * Contractual sports GGR = eligible settled stakes − winnings paid or payable.
 * Void, push, and cancelled stakes are excluded. Casino rows never arrive here.
 * An accumulator contributes its stake once. Corrections collapse to the latest fact.
 */
export function computeSportsbook(facts: readonly SportsBetFact[], brandCode: string): SportsbookComputation {
  const brandFacts = dedupe(facts.filter((fact) => (
    fact.brandCode === brandCode && fact.product === 'sports' && !fact.testAccount
  )));
  const byCurrency = new Map<string, Accumulator>();
  const sports = new Map<string, { stake: bigint; payout: bigint }>();
  let tagged = false;

  for (const fact of brandFacts) {
    const currency = normalizeCurrency(fact.currency);
    const stake = parseMinor(fact.stake);
    const payout = parseMinor(fact.payout);
    if (stake <= 0n || payout < 0n) throw new ProviderOfficeError('MONEY_INVALID');
    const bucket = byCurrency.get(currency) ?? emptyAccumulator();
    bucket.settledBetCount += 1;
    if (fact.settlement === 'cancelled' || fact.status === 'cancelled') {
      bucket.cancelledCount += 1;
      bucket.cancelledStakes += stake;
      bucket.refundedStakes += stake;
    } else if (fact.settlement === 'refund' || fact.settlement === 'push') {
      bucket.refundCount += 1;
      bucket.refundedStakes += stake;
    } else if (ELIGIBLE.has(fact.settlement) && fact.status === 'settled') {
      bucket.eligibleBetCount += 1;
      bucket.eligibleStakes += stake;
      bucket.winnings += payout;
      if (fact.settlement === 'winner' || fact.settlement === 'half_won') bucket.wonCount += 1;
      if (fact.settlement === 'loser' || fact.settlement === 'half_lost') bucket.lostCount += 1;
      const labels = distinctSports(fact.sports);
      if (labels.length > 0) {
        tagged = true;
        addAllocation(sports, labels, stake, payout);
      }
    } else {
      throw new ProviderOfficeError('SETTLEMENT_UNSUPPORTED');
    }
    byCurrency.set(currency, bucket);
  }

  const totals = [...byCurrency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, bucket]) => toTotals(currency, bucket));

  return {
    totals,
    sports: tagged
      ? { method: ALLOCATION_METHOD, status: 'allocated', rows: allocationRows(sports) }
      : { method: ALLOCATION_METHOD, status: 'SPORT_TAG_UNAVAILABLE', rows: [] },
  };
}

export function assertAllocationReconciles(totals: readonly NativeTotals[], rows: readonly SportAllocationRow[]): void {
  for (const total of totals) {
    const stake = rows.reduce((sum, row) => sum + parseMinor(row.eligibleStakes), 0n);
    const winnings = rows.reduce((sum, row) => sum + parseMinor(row.winnings), 0n);
    if (rows.length === 0) continue;
    if (stake !== parseMinor(total.eligibleStakes) || winnings !== parseMinor(total.winnings)) {
      throw new ProviderOfficeError('ALLOCATION_MISMATCH');
    }
  }
}

interface Accumulator {
  eligibleStakes: bigint;
  winnings: bigint;
  refundedStakes: bigint;
  cancelledStakes: bigint;
  settledBetCount: number;
  eligibleBetCount: number;
  wonCount: number;
  lostCount: number;
  refundCount: number;
  cancelledCount: number;
}

function emptyAccumulator(): Accumulator {
  return {
    eligibleStakes: 0n,
    winnings: 0n,
    refundedStakes: 0n,
    cancelledStakes: 0n,
    settledBetCount: 0,
    eligibleBetCount: 0,
    wonCount: 0,
    lostCount: 0,
    refundCount: 0,
    cancelledCount: 0,
  };
}

function toTotals(currency: string, bucket: Accumulator): NativeTotals {
  const ggr = bucket.eligibleStakes - bucket.winnings;
  return {
    currency,
    eligibleStakes: formatMinor(bucket.eligibleStakes),
    winnings: formatMinor(bucket.winnings),
    refundedStakes: formatMinor(bucket.refundedStakes),
    cancelledStakes: formatMinor(bucket.cancelledStakes),
    settledBetCount: bucket.settledBetCount,
    eligibleBetCount: bucket.eligibleBetCount,
    wonCount: bucket.wonCount,
    lostCount: bucket.lostCount,
    refundCount: bucket.refundCount,
    cancelledCount: bucket.cancelledCount,
    ggr: formatMinor(ggr),
    margin: marginPercent(ggr, bucket.eligibleStakes),
  };
}

function marginPercent(ggr: bigint, stakes: bigint): string | null {
  if (stakes === 0n) return null;
  const negative = ggr < 0n;
  const hundredths = ((negative ? -ggr : ggr) * 10_000n) / stakes;
  const whole = hundredths / 100n;
  const frac = (hundredths % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
}

function dedupe(facts: readonly SportsBetFact[]): SportsBetFact[] {
  const byId = new Map<string, SportsBetFact>();
  for (const fact of facts) {
    if (!fact.betId) throw new ProviderOfficeError('BET_ID_INVALID');
    const previous = byId.get(fact.betId);
    if (!previous) {
      byId.set(fact.betId, fact);
      continue;
    }
    if (previous.settledAt === fact.settledAt) {
      if (previous.stake !== fact.stake || previous.payout !== fact.payout || previous.settlement !== fact.settlement) {
        throw new ProviderOfficeError('DUPLICATE_BET_CONFLICT');
      }
      continue;
    }
    if (fact.settledAt > previous.settledAt) byId.set(fact.betId, fact);
  }
  return [...byId.values()];
}

function distinctSports(sports: readonly string[]): string[] {
  return [...new Set(sports.map((sport) => sport.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function addAllocation(
  sports: Map<string, { stake: bigint; payout: bigint }>,
  labels: readonly string[],
  stake: bigint,
  payout: bigint,
): void {
  const count = BigInt(labels.length);
  const stakeBase = stake / count;
  const payoutBase = payout / count;
  let stakeRemainder = stake % count;
  let payoutRemainder = payout % count;
  for (const label of labels) {
    const current = sports.get(label) ?? { stake: 0n, payout: 0n };
    const stakePart = stakeBase + (stakeRemainder > 0n ? 1n : 0n);
    const payoutPart = payoutBase + (payoutRemainder > 0n ? 1n : 0n);
    if (stakeRemainder > 0n) stakeRemainder -= 1n;
    if (payoutRemainder > 0n) payoutRemainder -= 1n;
    current.stake += stakePart;
    current.payout += payoutPart;
    sports.set(label, current);
  }
}

function allocationRows(sports: Map<string, { stake: bigint; payout: bigint }>): SportAllocationRow[] {
  return [...sports.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sport, amounts]) => ({
      sport,
      eligibleStakes: formatMinor(amounts.stake),
      winnings: formatMinor(amounts.payout),
      ggr: formatMinor(amounts.stake - amounts.payout),
    }));
}

function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3,8}$/.test(currency)) throw new ProviderOfficeError('CURRENCY_INVALID');
  return currency;
}
