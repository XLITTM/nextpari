import { casinoGames } from '../data';
import type { CasinoGame, Screen } from '../types';

/** Catalog ids that already have a real Nextpari game screen. */
const CASINO_GAME_SCREENS: Record<string, Screen> = {
  apples: { name: 'apples' },
  crystal: { name: 'crystal' },
  dice: { name: 'dice' },
  c4: { name: 'aviator' },
  aviator: { name: 'aviator' },
  blackjack: { name: 'blackjack' },
  pharaoh: { name: 'pharaoh' },
};

export function screenForCasinoGameId(id: string): Screen | undefined {
  return CASINO_GAME_SCREENS[id];
}

export function playableCasinoGames(): CasinoGame[] {
  return casinoGames.filter((game) => screenForCasinoGameId(game.id) != null);
}

export function openCasinoGame(game: CasinoGame, onNavigate?: (screen: Screen) => void) {
  const screen = screenForCasinoGameId(game.id);
  if (screen) onNavigate?.(screen);
}
