import { SPORTS_SETTLEMENT, isSportsSettlementCode, type SportsSettlementCode } from './settlement.js';

export function money2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Canonical Nextpari sports payout for a single stake S and accepted decimal odds O.
 * Returns null when no financial movement should occur.
 */
export function settlementPayout(
  stake: number,
  acceptedOdds: number,
  code: number,
): number | null {
  const s = money2(stake);
  const o = acceptedOdds;
  if (!Number.isFinite(s) || s < 0 || !Number.isFinite(o) || o <= 0) return null;
  if (code === SPORTS_SETTLEMENT.Pending) return null;
  if (code === SPORTS_SETTLEMENT.Lost) return 0;
  if (code === SPORTS_SETTLEMENT.Won) return money2(s * o);
  if (code === SPORTS_SETTLEMENT.Refund) return s;
  if (code === SPORTS_SETTLEMENT.HalfLost) return money2(s / 2);
  if (code === SPORTS_SETTLEMENT.HalfWon) return money2((s / 2) * o + s / 2);
  if (code === SPORTS_SETTLEMENT.Cancelled) return null;
  return null;
}

export function isKnownSettlementCode(code: number): code is SportsSettlementCode {
  return isSportsSettlementCode(code);
}

export interface SportsLegSettlement {
  acceptedOdds: number;
  settlement: number | null;
}

/**
 * Accumulator remaining-stake model. Pending (null/0) legs block payout.
 * Cancelled (-1) on an unsettled leg voids that leg (factor 1).
 */
export function accumulatorPayout(
  stake: number,
  legs: SportsLegSettlement[],
): { pending: boolean; payout: number | null; unknown: boolean } {
  if (!legs.length) return { pending: false, payout: null, unknown: true };
  let remaining = money2(stake);
  for (const leg of legs) {
    const code = leg.settlement;
    if (code == null || code === SPORTS_SETTLEMENT.Pending) {
      return { pending: true, payout: null, unknown: false };
    }
    if (!isKnownSettlementCode(code)) {
      return { pending: false, payout: null, unknown: true };
    }
    const factorOdds = Number.isFinite(leg.acceptedOdds) && leg.acceptedOdds > 1 ? leg.acceptedOdds : 1;
    if (code === SPORTS_SETTLEMENT.Cancelled || code === SPORTS_SETTLEMENT.Refund) {
      continue;
    }
    if (code === SPORTS_SETTLEMENT.Lost) {
      remaining = 0;
      continue;
    }
    if (code === SPORTS_SETTLEMENT.Won) {
      remaining = money2(remaining * factorOdds);
      continue;
    }
    if (code === SPORTS_SETTLEMENT.HalfLost) {
      remaining = money2(remaining / 2);
      continue;
    }
    if (code === SPORTS_SETTLEMENT.HalfWon) {
      remaining = money2((remaining / 2) * factorOdds + remaining / 2);
    }
  }
  return { pending: false, payout: remaining, unknown: false };
}

export interface SettlementTransition {
  action: 'none' | 'payout' | 'reverse' | 'corrected' | 'unmatched' | 'duplicate' | 'unknown';
  debitLastPayout: number;
  creditPayout: number;
  /** Economic amount credited after this step. Not the wallet delta. */
  nextEconomicPayout: number;
  nextState: 'unsettled' | 'settled' | 'cancelled';
  nextCode: number | null;
}

export function planSettlementTransition(input: {
  previousCode: number | null;
  previousPayout: number;
  incoming: number;
  stake: number;
  acceptedOdds: number;
  sameFingerprint: boolean;
}): SettlementTransition {
  const unsettled = input.previousCode == null || input.previousCode === SPORTS_SETTLEMENT.Pending;
  if (input.sameFingerprint) {
    return {
      action: 'duplicate',
      debitLastPayout: 0,
      creditPayout: 0,
      nextEconomicPayout: money2(input.previousPayout),
      nextState: unsettled ? 'unsettled' : 'settled',
      nextCode: input.previousCode,
    };
  }
  if (!isKnownSettlementCode(input.incoming)) {
    return {
      action: 'unknown',
      debitLastPayout: 0,
      creditPayout: 0,
      nextEconomicPayout: money2(input.previousPayout),
      nextState: unsettled ? 'unsettled' : 'settled',
      nextCode: input.previousCode,
    };
  }
  if (input.incoming === SPORTS_SETTLEMENT.Pending) {
    return {
      action: 'none',
      debitLastPayout: 0,
      creditPayout: 0,
      nextEconomicPayout: money2(input.previousPayout),
      nextState: unsettled ? 'unsettled' : 'settled',
      nextCode: input.previousCode,
    };
  }

  const previousSettled = input.previousCode != null
    && input.previousCode !== SPORTS_SETTLEMENT.Pending
    && input.previousCode !== SPORTS_SETTLEMENT.Cancelled;
  const lastPayout = money2(input.previousPayout);

  if (input.incoming === SPORTS_SETTLEMENT.Cancelled) {
    if (input.previousCode === SPORTS_SETTLEMENT.Cancelled) {
      return {
        action: 'duplicate',
        debitLastPayout: 0,
        creditPayout: 0,
        nextEconomicPayout: lastPayout,
        nextState: 'cancelled',
        nextCode: SPORTS_SETTLEMENT.Cancelled,
      };
    }
    if (!previousSettled && lastPayout <= 0) {
      const refund = money2(input.stake);
      return {
        action: refund > 0 ? 'payout' : 'none',
        debitLastPayout: 0,
        creditPayout: refund,
        nextEconomicPayout: refund,
        nextState: 'cancelled',
        nextCode: SPORTS_SETTLEMENT.Cancelled,
      };
    }
    return {
      action: lastPayout > 0 ? 'reverse' : 'none',
      debitLastPayout: lastPayout,
      creditPayout: 0,
      nextEconomicPayout: 0,
      nextState: 'cancelled',
      nextCode: SPORTS_SETTLEMENT.Cancelled,
    };
  }

  const nextPayout = money2(settlementPayout(input.stake, input.acceptedOdds, input.incoming) ?? 0);
  return planCumulativeSettlement({
    previousPayout: lastPayout,
    targetPayout: nextPayout,
    unsettled: !previousSettled && input.previousCode !== SPORTS_SETTLEMENT.Cancelled,
    incomingCode: input.incoming,
  });
}

/**
 * Move only target - previous. Same incoming settlement code can still
 * change an express target. Does not order different fingerprints.
 */
export function planCumulativeSettlement(input: {
  previousPayout: number;
  targetPayout: number;
  unsettled: boolean;
  incomingCode: number;
  availableBalance?: number;
}): SettlementTransition & { failedClosed: boolean } {
  const previous = money2(input.previousPayout);
  const target = money2(input.targetPayout);
  const delta = money2(target - previous);
  const base = {
    nextEconomicPayout: target,
    nextState: input.incomingCode === SPORTS_SETTLEMENT.Cancelled ? 'cancelled' as const : 'settled' as const,
    nextCode: input.incomingCode,
    failedClosed: false,
  };
  if (delta === 0 && !input.unsettled) {
    return {
      ...base,
      action: 'duplicate',
      debitLastPayout: 0,
      creditPayout: 0,
      nextEconomicPayout: previous,
    };
  }
  if (delta < 0) {
    const debit = money2(Math.abs(delta));
    if (input.availableBalance != null && input.availableBalance + 1e-9 < debit) {
      return {
        action: 'corrected',
        debitLastPayout: 0,
        creditPayout: 0,
        nextEconomicPayout: previous,
        nextState: input.unsettled ? 'unsettled' : 'settled',
        nextCode: null,
        failedClosed: true,
      };
    }
    return {
      ...base,
      action: input.incomingCode === SPORTS_SETTLEMENT.Cancelled && target === 0 ? 'reverse' : 'corrected',
      debitLastPayout: debit,
      creditPayout: 0,
    };
  }
  return {
    ...base,
    action: previous > 0 ? 'corrected' : 'payout',
    debitLastPayout: 0,
    creditPayout: delta > 0 ? delta : 0,
  };
}
