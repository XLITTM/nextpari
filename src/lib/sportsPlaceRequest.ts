import type { BetSelection } from '../types';
import { hasCompleteLsportsIdentity } from './sportsPlaceIdentity';
import { slipPlaceMode } from './sportsPlaceSlip';

export interface SportsPlaceLegPayload {
  provider: 'lsports';
  feedType: 'inplay' | 'prematch';
  fixtureId: string;
  marketId: string;
  marketKey: string;
  line: string;
  outcomeId: string;
  price: number;
  matchLabel?: string;
  league?: string;
  outcomeName?: string;
}

export function serializeSportsPlaceLeg(row: BetSelection): SportsPlaceLegPayload {
  return {
    provider: 'lsports',
    feedType: row.feedType === 'prematch' ? 'prematch' : 'inplay',
    fixtureId: String(row.fixtureId ?? row.matchId ?? '').trim(),
    marketId: String(row.marketId ?? '').trim(),
    marketKey: String(row.marketKey ?? '').trim(),
    line: String(row.line ?? ''),
    outcomeId: String(row.outcomeId ?? '').trim(),
    price: row.odds,
    matchLabel: row.matchLabel,
    league: row.league,
    outcomeName: row.outcome,
  };
}

export function serializeSportsPlaceBody(params: {
  selections: BetSelection[];
  stake: number;
  idempotencyKey: string;
}): {
  stake: number;
  mode: 'single' | 'express';
  idempotencyKey: string;
  selections: SportsPlaceLegPayload[];
} {
  return {
    stake: params.stake,
    mode: slipPlaceMode(params.selections),
    idempotencyKey: params.idempotencyKey,
    selections: params.selections.map(serializeSportsPlaceLeg),
  };
}

export function assertLsportsPlaceLeg(leg: SportsPlaceLegPayload): boolean {
  return hasCompleteLsportsIdentity({
    provider: leg.provider,
    fixtureId: leg.fixtureId,
    marketId: leg.marketId,
    marketKey: leg.marketKey,
    line: leg.line,
    outcomeId: leg.outcomeId,
  });
}
