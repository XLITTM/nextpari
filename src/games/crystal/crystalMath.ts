export const GRID = 7;
export const CELL_COUNT = GRID * GRID;
export const MIN_CLUSTER = 5;

export type GemKind = 'green' | 'cyan' | 'red' | 'blue' | 'purple' | 'orange' | 'coin';

export const GEM_KINDS: GemKind[] = ['green', 'cyan', 'red', 'blue', 'purple', 'orange', 'coin'];

export interface CrystalCell {
  id: string;
  kind: GemKind;
}

export interface CrystalCluster {
  kind: GemKind;
  indices: number[];
  multiplier: number;
}

export interface CascadeStep {
  board: CrystalCell[];
  clusters: CrystalCluster[];
  exploding: boolean[];
  combo: number;
  stepWin: number;
  nextBoard: CrystalCell[];
}

export interface SpinResult {
  startBoard: CrystalCell[];
  steps: CascadeStep[];
  totalWin: number;
  totalMultiplier: number;
}

const WEIGHTS: { kind: GemKind; weight: number }[] = [
  { kind: 'green', weight: 18 },
  { kind: 'cyan', weight: 17 },
  { kind: 'red', weight: 17 },
  { kind: 'blue', weight: 16 },
  { kind: 'purple', weight: 15 },
  { kind: 'orange', weight: 14 },
  { kind: 'coin', weight: 3 },
];

const WEIGHT_SUM = WEIGHTS.reduce((sum, item) => sum + item.weight, 0);

let cellSeq = 0;

function nextId(): string {
  cellSeq += 1;
  return `g${cellSeq}`;
}

export function randomKind(): GemKind {
  let roll = Math.random() * WEIGHT_SUM;
  for (const item of WEIGHTS) {
    roll -= item.weight;
    if (roll <= 0) return item.kind;
  }
  return 'green';
}

export function createCell(kind: GemKind = randomKind()): CrystalCell {
  return { id: nextId(), kind };
}

export function createBoard(): CrystalCell[] {
  return Array.from({ length: CELL_COUNT }, () => createCell());
}

export function comboMultiplier(winIndex: number): number {
  if (winIndex <= 0) return 1;
  if (winIndex === 1) return 2;
  if (winIndex === 2) return 3;
  return 5;
}

export function clusterMultiplier(kind: GemKind, size: number): number {
  if (size < MIN_CLUSTER) return 0;
  if (kind === 'coin') {
    if (size >= 10) return 20;
    if (size === 9) return 16;
    if (size === 8) return 12;
    if (size === 7) return 10;
    if (size === 6) return 8;
    return 5;
  }
  if (size >= 11) return 5;
  if (size === 10) return 4.5;
  if (size === 9) return 4;
  if (size === 8) return 3.5;
  if (size === 7) return 3;
  if (size === 6) return 2;
  return 0.6;
}

export const PAYTABLE = {
  gems: [
    { size: '5', mult: '×0.6' },
    { size: '6', mult: '×2.0' },
    { size: '7', mult: '×3.0' },
    { size: '8', mult: '×3.5' },
    { size: '9', mult: '×4.0' },
    { size: '10+', mult: '×4.5–×5.0' },
  ],
  coins: [
    { size: '5', mult: '×5' },
    { size: '6', mult: '×8' },
    { size: '7', mult: '×10' },
    { size: '8', mult: '×12' },
    { size: '9', mult: '×16' },
    { size: '10+', mult: '×20' },
  ],
  combos: ['×1', '×2', '×3', '×5'],
} as const;

function neighbors(index: number): number[] {
  const col = index % GRID;
  const next: number[] = [];
  if (index >= GRID) next.push(index - GRID);
  if (index < CELL_COUNT - GRID) next.push(index + GRID);
  if (col > 0) next.push(index - 1);
  if (col < GRID - 1) next.push(index + 1);
  return next;
}

export function findClusters(board: CrystalCell[]): CrystalCluster[] {
  const seen = new Array<boolean>(CELL_COUNT).fill(false);
  const clusters: CrystalCluster[] = [];

  for (let start = 0; start < CELL_COUNT; start += 1) {
    if (seen[start]) continue;
    const kind = board[start].kind;
    const queue = [start];
    const indices: number[] = [];
    seen[start] = true;

    while (queue.length > 0) {
      const current = queue.pop() as number;
      indices.push(current);
      for (const next of neighbors(current)) {
        if (seen[next] || board[next].kind !== kind) continue;
        seen[next] = true;
        queue.push(next);
      }
    }

    if (indices.length >= MIN_CLUSTER) {
      clusters.push({
        kind,
        indices,
        multiplier: clusterMultiplier(kind, indices.length),
      });
    }
  }

  return clusters;
}

export function applyGravity(board: (CrystalCell | null)[]): CrystalCell[] {
  const next = new Array<CrystalCell | null>(CELL_COUNT).fill(null);
  for (let col = 0; col < GRID; col += 1) {
    const stack: CrystalCell[] = [];
    for (let row = GRID - 1; row >= 0; row -= 1) {
      const cell = board[row * GRID + col];
      if (cell) stack.push(cell);
    }
    for (let i = 0; i < stack.length; i += 1) {
      next[(GRID - 1 - i) * GRID + col] = stack[i];
    }
    for (let row = GRID - 1 - stack.length; row >= 0; row -= 1) {
      next[row * GRID + col] = createCell();
    }
  }
  return next as CrystalCell[];
}

export function resolveSpin(stake: number): SpinResult {
  const startBoard = createBoard();
  const steps: CascadeStep[] = [];
  let board = startBoard;
  let totalWin = 0;
  let winIndex = 0;

  for (let safety = 0; safety < 20; safety += 1) {
    const clusters = findClusters(board);
    if (clusters.length === 0) break;

    const exploding = new Array<boolean>(CELL_COUNT).fill(false);
    let clusterSum = 0;
    for (const cluster of clusters) {
      clusterSum += cluster.multiplier;
      for (const index of cluster.indices) exploding[index] = true;
    }

    const combo = comboMultiplier(winIndex);
    const stepWin = Number((stake * clusterSum * combo).toFixed(2));
    const cleared = board.map((cell, index) => (exploding[index] ? null : cell));
    const nextBoard = applyGravity(cleared);

    steps.push({ board, clusters, exploding, combo, stepWin, nextBoard });
    totalWin = Number((totalWin + stepWin).toFixed(2));
    board = nextBoard;
    winIndex += 1;
  }

  const totalMultiplier = stake > 0 ? Number((totalWin / stake).toFixed(2)) : 0;
  return { startBoard, steps, totalWin, totalMultiplier };
}
