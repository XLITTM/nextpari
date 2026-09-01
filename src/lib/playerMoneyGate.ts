export const CANONICAL_SPORTS_BET_ENABLED = false;
export const CANONICAL_GAMES_WAGER_ENABLED = true;

export const SPORTS_BET_GATE_MESSAGE =
  'Приём ставок на реальные деньги временно недоступен. Канонический betting engine ещё не подключён.';

export const GAMES_WAGER_GATE_MESSAGE =
  'Игра на реальные деньги временно недоступна. Канонический game engine ещё не подключён.';

export function blockedSportsBet(): string | null {
  return CANONICAL_SPORTS_BET_ENABLED ? null : SPORTS_BET_GATE_MESSAGE;
}

export function blockedGamesWager(): string | null {
  return CANONICAL_GAMES_WAGER_ENABLED ? null : GAMES_WAGER_GATE_MESSAGE;
}
