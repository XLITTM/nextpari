/**
 * Single server-side sports betting switch.
 * Private development: set CANONICAL_SPORTS_BET_ENABLED=1 on the API host.
 * Public launch: set 0/unset to disable globally.
 *
 * Never put this behind VITE_*. The browser cannot enable betting.
 */
export const SPORTS_BET_GATE_MESSAGE =
  'Приём ставок на реальные деньги временно недоступен. Канонический betting engine ещё не подключён.';

export const GAMES_WAGER_GATE_MESSAGE =
  'Игра на реальные деньги временно недоступна. Канонический game engine ещё не подключён.';

export const CANONICAL_GAMES_WAGER_ENABLED = true;

function readProcessEnv(): Record<string, string | undefined> {
  try {
    if (typeof process === 'undefined' || process.env == null) return {};
    return process.env;
  } catch {
    return {};
  }
}

export function isCanonicalSportsBetEnabled(
  env: Record<string, string | undefined> = readProcessEnv(),
): boolean {
  return String(env.CANONICAL_SPORTS_BET_ENABLED ?? '').trim() === '1';
}

/** False unless the API process env enables it. Vite/browser bundles stay disabled. */
export const CANONICAL_SPORTS_BET_ENABLED = isCanonicalSportsBetEnabled();

export function blockedSportsBet(
  env: Record<string, string | undefined> = readProcessEnv(),
): string | null {
  if (typeof window !== 'undefined') {
    return null;
  }
  return isCanonicalSportsBetEnabled(env) ? null : SPORTS_BET_GATE_MESSAGE;
}

export function blockedGamesWager(): string | null {
  return CANONICAL_GAMES_WAGER_ENABLED ? null : GAMES_WAGER_GATE_MESSAGE;
}
