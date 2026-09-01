import { CELL_COUNT, GRID, type CrystalCell, type GemKind } from './crystalMath';

export interface CascadeActor {
  id: string;
  kind: GemKind;
  col: number;
  fromRow: number;
  toRow: number;
  isNew: boolean;
}

/**
 * Deterministic FLIP plan from an authoritative cascade step.
 * Survivors fall down (fromRow < toRow). New gems start above the board (fromRow < 0).
 */
export function deriveCascadeActors(
  oldBoard: CrystalCell[],
  exploding: boolean[],
  nextBoard: CrystalCell[],
): CascadeActor[] {
  const actors: CascadeActor[] = [];
  for (let col = 0; col < GRID; col += 1) {
    const survivors: { cell: CrystalCell; fromRow: number }[] = [];
    for (let row = GRID - 1; row >= 0; row -= 1) {
      const index = row * GRID + col;
      const cell = oldBoard[index];
      if (!cell) continue;
      if (exploding[index]) continue;
      survivors.push({ cell, fromRow: row });
    }
    survivors.forEach((survivor, stackIndex) => {
      actors.push({
        id: survivor.cell.id,
        kind: survivor.cell.kind,
        col,
        fromRow: survivor.fromRow,
        toRow: GRID - 1 - stackIndex,
        isNew: false,
      });
    });
    const incomingRows = GRID - survivors.length;
    for (let row = 0; row < incomingRows; row += 1) {
      const cell = nextBoard[row * GRID + col];
      if (!cell) continue;
      actors.push({
        id: cell.id,
        kind: cell.kind,
        col,
        fromRow: row - incomingRows,
        toRow: row,
        isNew: true,
      });
    }
  }
  return actors;
}

export function reducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export { CELL_COUNT, GRID };
