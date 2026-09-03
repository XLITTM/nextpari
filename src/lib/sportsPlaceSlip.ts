import type { BetSelection } from '../types';
import { placeModeFromCount, type SportsPlaceMode } from './sportsPlaceMode';

export function addSlipSelection(prev: BetSelection[], selection: BetSelection): BetSelection[] {
  if (prev.some((row) => row.id === selection.id)) {
    return prev.filter((row) => row.id !== selection.id);
  }
  return [...prev.filter((row) => row.matchId !== selection.matchId), selection];
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
