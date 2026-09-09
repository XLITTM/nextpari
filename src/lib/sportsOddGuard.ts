import type { BetSelection } from '../types';
import { hasCompleteLsportsIdentity } from './sportsPlaceIdentity';

const LSPORTS_PROVIDER = 'lsports';

export function isLsportsSelection(row: Pick<BetSelection, 'provider'>): boolean {
  return String(row.provider ?? '').trim() === LSPORTS_PROVIDER;
}

function readProviderId(value: unknown): string {
  return String(value ?? '').trim();
}

function genericIdentity(selection: BetSelection): {
  provider: string;
  fixtureId: string;
  marketId: string;
  marketKey: string;
  line: string;
  outcomeId: string;
  odds: number;
} {
  return {
    provider: readProviderId(selection.provider),
    fixtureId: String(selection.fixtureId ?? selection.matchId ?? '').trim(),
    marketId: String(selection.marketId ?? '').trim(),
    marketKey: String(selection.marketKey ?? '').trim(),
    line: String(selection.line ?? ''),
    outcomeId: String(selection.outcomeId ?? '').trim(),
    odds: Number(selection.odds),
  };
}

export function acceptSportsSelection(selection: BetSelection): BetSelection | null {
  const candidate = genericIdentity(selection);
  if (!candidate.provider) return null;
  if (!candidate.fixtureId || !candidate.outcomeId) return null;
  if (!Number.isFinite(candidate.odds) || candidate.odds <= 0) return null;
  if (candidate.provider === LSPORTS_PROVIDER) {
    return acceptLsportsSelection(selection);
  }
  return selection;
}

export function acceptLsportsSelection(selection: BetSelection): BetSelection | null {
  if (!isLsportsSelection(selection)) return null;
  const candidate = genericIdentity(selection);
  if (!hasCompleteLsportsIdentity({
    provider: LSPORTS_PROVIDER,
    fixtureId: candidate.fixtureId,
    marketId: candidate.marketId,
    marketKey: candidate.marketKey,
    line: candidate.line,
    outcomeId: candidate.outcomeId,
  })) return null;
  return selection;
}
