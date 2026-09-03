export type SportsPlaceMode = 'single' | 'express';

export function placeModeFromCount(legCount: number): SportsPlaceMode {
  return legCount >= 2 ? 'express' : 'single';
}

export function placeModeLabel(mode: SportsPlaceMode): 'Ординар' | 'Экспресс' {
  return mode === 'express' ? 'Экспресс' : 'Ординар';
}
