import { APPLE_LEVELS } from './appleConfig';
import type { AppleCell, AppleRow } from './types';

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function buildBoard(): AppleRow[] {
  return APPLE_LEVELS.map((cfg) => {
    const kinds: AppleCell['kind'][] = [
      ...Array.from({ length: cfg.goodApples }, () => 'good' as const),
      ...Array.from({ length: cfg.badApples }, () => 'bad' as const),
    ];
    return {
      level: cfg.level,
      multiplier: cfg.multiplier,
      cells: shuffle(kinds).map((kind, index) => ({
        id: `${cfg.level}-${index}`,
        kind,
        revealed: false,
        picked: false,
      })),
    };
  });
}

export function revealBoard(rows: AppleRow[]): AppleRow[] {
  return rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => ({ ...cell, revealed: true })),
  }));
}

export function formatMult(value: number): string {
  if (value >= 100) return `x${value.toFixed(0)}`;
  return `x${value.toFixed(2)}`;
}
