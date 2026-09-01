import { CELL_COUNT, GRID, type CrystalCell, type GemKind } from './crystalMath';

export const CRYSTAL_HIGHLIGHT_MS = 160;
export const CRYSTAL_EXPLODE_MS = 220;
export const CRYSTAL_FALL_MS = 260;
export const CRYSTAL_LAND_MS = 100;
export const CRYSTAL_REDUCED_STEP_MS = 80;

export interface CascadeActor {
  id: string;
  kind: GemKind;
  col: number;
  fromRow: number;
  toRow: number;
  isNew: boolean;
}

export interface RestingSlot {
  id: string;
  kind: GemKind;
  index: number;
  col: number;
  row: number;
  transform: 'none';
}

export interface GridMetrics {
  cellW: number;
  cellH: number;
  strideX: number;
  strideY: number;
  originX: number;
  originY: number;
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

/** Settled board: one integer (col,row) per cell, no animation offset. */
export function restingSlots(board: CrystalCell[]): RestingSlot[] {
  return board.map((cell, index) => ({
    id: cell.id,
    kind: cell.kind,
    index,
    col: index % GRID,
    row: Math.floor(index / GRID),
    transform: 'none' as const,
  }));
}

export function overlayPoint(col: number, row: number, metrics: GridMetrics): { x: number; y: number } {
  return {
    x: metrics.originX + col * metrics.strideX,
    y: metrics.originY + row * metrics.strideY,
  };
}

export function cascadeFallWaitMs(reducedMotion: boolean): number {
  if (reducedMotion) return CRYSTAL_REDUCED_STEP_MS;
  return CRYSTAL_FALL_MS + CRYSTAL_LAND_MS;
}

export function reducedMotionPreferred(): boolean {
  const media = (globalThis as { matchMedia?: (query: string) => { matches: boolean } }).matchMedia;
  if (typeof media !== 'function') return false;
  return media('(prefers-reduced-motion: reduce)').matches;
}

export { CELL_COUNT, GRID };
