export const LSPORTS_SETTLEMENT = {
  Cancelled: -1,
  NotSettled: 0,
  Loser: 1,
  Winner: 2,
  Refund: 3,
  HalfLost: 4,
  HalfWon: 5,
} as const;

export type LsportsSettlementCode = (typeof LSPORTS_SETTLEMENT)[keyof typeof LSPORTS_SETTLEMENT];

export type LsportsSettlementPhase = 'pending' | 'settled' | 'cancelled' | 'corrected';

export interface LsportsOutcomeSettlement {
  received: LsportsSettlementCode;
  effective: Exclude<LsportsSettlementCode, -1>;
  previousEffective: Exclude<LsportsSettlementCode, -1>;
  phase: LsportsSettlementPhase;
  lastFingerprint: string;
}

export function isSettlementCode(value: unknown): value is LsportsSettlementCode {
  return value === -1 || value === 0 || value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

export function readSettlementCode(value: unknown): LsportsSettlementCode | null {
  if (typeof value === 'number' && isSettlementCode(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (isSettlementCode(parsed)) return parsed;
  }
  return null;
}

export function settlementFingerprint(input: {
  msgGuid?: string | null;
  betId: string;
  settlement: LsportsSettlementCode;
  lastUpdate?: string | null;
}): string {
  return [input.msgGuid ?? '', input.betId, String(input.settlement), input.lastUpdate ?? ''].join('|');
}

export function emptySettlement(): LsportsOutcomeSettlement {
  return {
    received: LSPORTS_SETTLEMENT.NotSettled,
    effective: LSPORTS_SETTLEMENT.NotSettled,
    previousEffective: LSPORTS_SETTLEMENT.NotSettled,
    phase: 'pending',
    lastFingerprint: '',
  };
}

/**
 * Apply an official Type 35 settlement code.
 * -1 reverts effective state to NotSettled and keeps previousEffective for a later correction.
 * Duplicate fingerprints are ignored (idempotent, no extra phase change).
 * No payout or wallet logic.
 */
export function applySettlementCode(
  previous: LsportsOutcomeSettlement | undefined,
  incoming: LsportsSettlementCode,
  fingerprint: string,
): { next: LsportsOutcomeSettlement; changed: boolean } {
  const current = previous ?? emptySettlement();
  if (current.lastFingerprint && current.lastFingerprint === fingerprint) {
    return { next: current, changed: false };
  }
  if (incoming === current.received && current.lastFingerprint) {
    return {
      changed: false,
      next: { ...current, lastFingerprint: fingerprint },
    };
  }

  if (incoming === LSPORTS_SETTLEMENT.Cancelled) {
    return {
      changed: true,
      next: {
        received: LSPORTS_SETTLEMENT.Cancelled,
        effective: LSPORTS_SETTLEMENT.NotSettled,
        previousEffective: current.effective,
        phase: 'cancelled',
        lastFingerprint: fingerprint,
      },
    };
  }

  if (incoming === LSPORTS_SETTLEMENT.NotSettled) {
    return {
      changed: true,
      next: {
        received: LSPORTS_SETTLEMENT.NotSettled,
        effective: LSPORTS_SETTLEMENT.NotSettled,
        previousEffective: current.effective,
        phase: 'pending',
        lastFingerprint: fingerprint,
      },
    };
  }

  const phase: LsportsSettlementPhase = current.phase === 'cancelled' ? 'corrected' : 'settled';
  return {
    changed: true,
    next: {
      received: incoming,
      effective: incoming,
      previousEffective: current.effective,
      phase,
      lastFingerprint: fingerprint,
    },
  };
}
