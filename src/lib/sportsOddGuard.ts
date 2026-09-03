import type { BetSelection } from '../types';
import { hasCompleteLsportsIdentity } from './sportsPlaceIdentity';

export function isLsportsSelection(row: Pick<BetSelection, 'provider'>): boolean {
  return row.provider === 'lsports';
}

export function acceptLsportsSelection(selection: BetSelection): BetSelection | null {
  const candidate = {
    provider: 'lsports' as const,
    fixtureId: String(selection.fixtureId ?? selection.matchId ?? '').trim(),
    marketId: String(selection.marketId ?? '').trim(),
    marketKey: String(selection.marketKey ?? '').trim(),
    line: String(selection.line ?? ''),
    outcomeId: String(selection.outcomeId ?? '').trim(),
  };
  if (!hasCompleteLsportsIdentity(candidate)) return null;
  return selection;
}
