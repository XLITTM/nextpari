export const CASINO_COVERS: Record<string, string> = {
  c1: '/images/games/apple-fortune.svg',
  c2: '/images/games/crystal.svg',
  c3: '/images/games/blackjack.svg',
  c4: '/images/games/aviator.svg',
  aviator: '/images/games/aviator.svg',
  apples: '/images/games/apple-fortune.svg',
  crystal: '/images/games/crystal.svg',
  blackjack: '/images/games/blackjack.svg',
  c5: '/images/games/burning-hot.svg',
  c6: '/images/games/western-slot.svg',
  c7: '/images/games/aviator.svg',
  c8: '/images/games/crystal.svg',
  c9: '/images/games/western-slot.svg',
  c10: '/images/games/crystal.svg',
  c11: '/images/games/apple-fortune.svg',
  c12: '/images/games/blackjack.svg',
  'western-slot': '/images/games/western-slot.svg',
  'burning-hot': '/images/games/burning-hot.svg',
};

export function coverForGame(id: string, fallback?: string): string | undefined {
  return CASINO_COVERS[id] ?? fallback;
}
