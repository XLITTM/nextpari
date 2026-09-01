export const ARCADE_SCREEN_NAMES = [
  'pharaoh',
  'dice',
  'blackjack',
  'apples',
  'crystal',
  'aviator',
] as const;

export type ArcadeScreenName = (typeof ARCADE_SCREEN_NAMES)[number];

const listeners = new Set<() => void>();
let arcadePaused = false;

export function isArcadeScreenName(name: string): boolean {
  return (ARCADE_SCREEN_NAMES as readonly string[]).includes(name);
}

export function isArcadeSportsPaused(): boolean {
  return arcadePaused;
}

export function setArcadeSportsPaused(paused: boolean): void {
  if (arcadePaused === paused) return;
  arcadePaused = paused;
  for (const listener of listeners) listener();
}

export function subscribeArcadeSportsPause(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
