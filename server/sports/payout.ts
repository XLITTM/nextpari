import { LSPORTS_SETTLEMENT, type LsportsSettlementCode } from '../lsports/state/settlement.js';

export function money2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Official Type 35 mapping for a single stake S and accepted decimal odds O.
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
  if (code === LSPORTS_SETTLEMENT.NotSettled) return null;
  if (code === LSPORTS_SETTLEMENT.Loser) return 0;
  if (code === LSPORTS_SETTLEMENT.Winner) return money2(s * o);
  if (code === LSPORTS_SETTLEMENT.Refund) return s;
  if (code === LSPORTS_SETTLEMENT.HalfLost) return money2(s / 2);
  if (code === LSPORTS_SETTLEMENT.HalfWon) return money2((s / 2) * o + s / 2);
  if (code === LSPORTS_SETTLEMENT.Cancelled) return null;
  return null;
}

export function isKnownSettlementCode(code: number): code is LsportsSettlementCode {
  return code === -1 || code === 0 || code === 1 || code === 2 || code === 3 || code === 4 || code === 5;
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
    if (code == null || code === LSPORTS_SETTLEMENT.NotSettled) {
      return { pending: true, payout: null, unknown: false };
    }
    if (!isKnownSettlementCode(code)) {
      return { pending: false, payout: null, unknown: true };
    }
    const factorOdds = Number.isFinite(leg.acceptedOdds) && leg.acceptedOdds > 1 ? leg.acceptedOdds : 1;
    if (code === LSPORTS_SETTLEMENT.Cancelled || code === LSPORTS_SETTLEMENT.Refund) {
      continue;
    }
    if (code === LSPORTS_SETTLEMENT.Loser) {
      remaining = 0;
      continue;
    }
    if (code === LSPORTS_SETTLEMENT.Winner) {
      remaining = money2(remaining * factorOdds);
      continue;
    }
    if (code === LSPORTS_SETTLEMENT.HalfLost) {
      remaining = money2(remaining / 2);
      continue;
    }
    if (code === LSPORTS_SETTLEMENT.HalfWon) {
      remaining = money2((remaining / 2) * factorOdds + remaining / 2);
    }
  }
  return { pending: false, payout: remaining, unknown: false };
}

export interface SettlementTransition {
  action: 'none' | 'payout' | 'reverse' | 'reverse_then_payout' | 'unmatched' | 'duplicate' | 'unknown';
  debitLastPayout: number;
  creditPayout: number;
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
  if (input.sameFingerprint) {
    return {
      action: 'duplicate',
      debitLastPayout: 0,
      creditPayout: 0,
      nextState: input.previousCode == null || input.previousCode === 0 ? 'unsettled' : 'settled',
      nextCode: input.previousCode,
    };
  }
  if (!isKnownSettlementCode(input.incoming)) {
    return {
      action: 'unknown',
      debitLastPayout: 0,
      creditPayout: 0,
      nextState: input.previousCode == null || input.previousCode === 0 ? 'unsettled' : 'settled',
      nextCode: input.previousCode,
    };
  }
  if (input.incoming === LSPORTS_SETTLEMENT.NotSettled) {
    return {
      action: 'none',
      debitLastPayout: 0,
      creditPayout: 0,
      nextState: input.previousCode == null || input.previousCode === 0 ? 'unsettled' : 'settled',
      nextCode: input.previousCode,
    };
  }

  const previousSettled = input.previousCode != null
    && input.previousCode !== LSPORTS_SETTLEMENT.NotSettled
    && input.previousCode !== LSPORTS_SETTLEMENT.Cancelled;
  const lastPayout = money2(input.previousPayout);

  if (input.incoming === LSPORTS_SETTLEMENT.Cancelled) {
    if (!previousSettled && lastPayout <= 0) {
      const refund = money2(input.stake);
      return {
        action: refund > 0 ? 'payout' : 'none',
        debitLastPayout: 0,
        creditPayout: refund,
        nextState: 'cancelled',
        nextCode: -1,
      };
    }
    return {
      action: lastPayout > 0 ? 'reverse' : 'none',
      debitLastPayout: lastPayout,
      creditPayout: 0,
      nextState: 'cancelled',
      nextCode: -1,
    };
  }

  const nextPayout = settlementPayout(input.stake, input.acceptedOdds, input.incoming) ?? 0;
  if (previousSettled && input.previousCode === input.incoming && lastPayout === money2(nextPayout)) {
    return {
      action: 'duplicate',
      debitLastPayout: 0,
      creditPayout: 0,
      nextState: 'settled',
      nextCode: input.incoming,
    };
  }
  if (previousSettled || lastPayout > 0) {
    return {
      action: 'reverse_then_payout',
      debitLastPayout: lastPayout,
      creditPayout: money2(nextPayout),
      nextState: 'settled',
      nextCode: input.incoming,
    };
  }
  return {
    action: nextPayout === 0 && input.incoming === LSPORTS_SETTLEMENT.Loser ? 'payout' : 'payout',
    debitLastPayout: 0,
    creditPayout: money2(nextPayout),
    nextState: 'settled',
    nextCode: input.incoming,
  };
}
