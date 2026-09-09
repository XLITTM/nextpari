import type { BetSelection } from '../types';
import { hasCompleteLsportsIdentity } from './sportsPlaceIdentity';
import { slipPlaceMode } from './sportsPlaceSlip';

const LSPORTS_PROVIDER = 'lsports';

export interface SportsPlaceLegPayload {
  provider: string;
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

function readProviderId(value: unknown): string {
  return String(value ?? '').trim();
}

export function serializeSportsPlaceLeg(row: BetSelection): SportsPlaceLegPayload {
  return {
    provider: readProviderId(row.provider),
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
} | null {
  const selections = params.selections.map(serializeSportsPlaceLeg);
  if (selections.some((leg) => !assertSportsPlaceLeg(leg))) {
    return null;
  }
  return {
    stake: params.stake,
    mode: slipPlaceMode(params.selections),
    idempotencyKey: params.idempotencyKey,
    selections,
  };
}

export function assertSportsPlaceLeg(leg: SportsPlaceLegPayload): boolean {
  const provider = readProviderId(leg.provider);
  if (!provider) return false;
  const fixtureId = String(leg.fixtureId ?? '').trim();
  const outcomeId = String(leg.outcomeId ?? '').trim();
  if (!fixtureId || !outcomeId) return false;
  if (provider === LSPORTS_PROVIDER) {
    return assertLsportsPlaceLeg(leg);
  }
  return true;
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
