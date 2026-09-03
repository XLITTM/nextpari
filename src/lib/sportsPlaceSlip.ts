import type { BetSelection } from '../types';
import { acceptLsportsSelection } from './sportsOddGuard';
import { placeModeFromCount, type SportsPlaceMode } from './sportsPlaceMode';

export function addSlipSelection(prev: BetSelection[], selection: BetSelection): BetSelection[] {
  const accepted = acceptLsportsSelection(selection);
  if (!accepted) return prev;
  if (prev.some((row) => row.id === accepted.id)) {
    return prev.filter((row) => row.id !== accepted.id);
  }
  return [...prev.filter((row) => row.matchId !== accepted.matchId), accepted];
}

export function removeSlipSelection(
  prev: BetSelection[],
  matchId: string,
  outcome: string,
): BetSelection[] {
  return prev.filter((row) => !(row.matchId === matchId && row.outcome === outcome));
}

export function slipPlaceMode(selections: BetSelection[]): SportsPlaceMode {
  return placeModeFromCount(selections.length);
}
