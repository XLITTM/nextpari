import { SPORTS_PROVIDER_LSPORTS } from '../sports/types.js';
import {
  SPORTS_SETTLEMENT,
  type SportsSettlementCode,
  type SportsSettlementNotice,
} from '../sports/settlement.js';
import { LSPORTS_SETTLEMENT } from './state/settlement.js';
import type { LsportsSettlementNotice } from './state/store.js';

export function mapLsportsType35ToCanonical(code: number): SportsSettlementCode | null {
  switch (code) {
    case LSPORTS_SETTLEMENT.Cancelled:
      return SPORTS_SETTLEMENT.Cancelled;
    case LSPORTS_SETTLEMENT.NotSettled:
      return SPORTS_SETTLEMENT.Pending;
    case LSPORTS_SETTLEMENT.Loser:
      return SPORTS_SETTLEMENT.Lost;
    case LSPORTS_SETTLEMENT.Winner:
      return SPORTS_SETTLEMENT.Won;
    case LSPORTS_SETTLEMENT.Refund:
      return SPORTS_SETTLEMENT.Refund;
    case LSPORTS_SETTLEMENT.HalfLost:
      return SPORTS_SETTLEMENT.HalfLost;
    case LSPORTS_SETTLEMENT.HalfWon:
      return SPORTS_SETTLEMENT.HalfWon;
    default:
      return null;
  }
}

export function toCanonicalSettlementNotice(notice: LsportsSettlementNotice): SportsSettlementNotice | null {
  const settlement = mapLsportsType35ToCanonical(notice.settlement);
  const fingerprint = String(notice.fingerprint ?? '').trim();
  const outcomeId = String(notice.betId ?? '').trim();
  if (settlement == null || !fingerprint || !outcomeId) return null;
  return {
    provider: SPORTS_PROVIDER_LSPORTS,
    fixtureId: String(notice.fixtureId),
    marketId: String(notice.marketId ?? ''),
    marketKey: String(notice.marketKey ?? ''),
    outcomeId,
    settlement,
    fingerprint,
    lastUpdate: notice.lastUpdate ?? null,
  };
}

export function toCanonicalSettlementNotices(notices: LsportsSettlementNotice[]): SportsSettlementNotice[] {
  const next: SportsSettlementNotice[] = [];
  for (const notice of notices) {
    const canonical = toCanonicalSettlementNotice(notice);
    if (canonical) next.push(canonical);
  }
  return next;
}
