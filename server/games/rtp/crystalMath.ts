export type GemKind = 'green' | 'cyan' | 'red' | 'blue' | 'purple' | 'orange' | 'coin';

export const CRYSTAL_MATH_VERSION = 'crystal-v2-rtp875';
export const CRYSTAL_SIM_SEED = 20260901;
export const CRYSTAL_SIM_ROUNDS = 1_000_000;
export const CRYSTAL_GRID = 7;
export const CRYSTAL_CELLS = 49;
export const CRYSTAL_MIN_CLUSTER = 5;
export const CRYSTAL_WEIGHTS = [18, 17, 17, 16, 15, 14, 3] as const;
export const CRYSTAL_KINDS: readonly GemKind[] = [
  'green', 'cyan', 'red', 'blue', 'purple', 'orange', 'coin',
];

/** Scales cluster+combo payouts so simulated RTP sits near 87.5%. */
export const CRYSTAL_PAYOUT_SCALE = 1;

export function crystalClusterMult(kind: GemKind, size: number): number {
  if (size < CRYSTAL_MIN_CLUSTER) return 0;
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

export function crystalCombo(winIndex: number): number {
  if (winIndex <= 0) return 1;
  if (winIndex === 1) return 2;
  if (winIndex === 2) return 3;
  return 5;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function nextKind(rand: () => number): GemKind {
  const roll = Math.floor(rand() * 100);
  let acc = 0;
  for (let i = 0; i < CRYSTAL_WEIGHTS.length; i += 1) {
    acc += CRYSTAL_WEIGHTS[i];
    if (roll < acc) return CRYSTAL_KINDS[i];
  }
  return 'green';
}

function neighbors(index: number): number[] {
  const col = index % CRYSTAL_GRID;
  const next: number[] = [];
  if (index >= CRYSTAL_GRID) next.push(index - CRYSTAL_GRID);
  if (index < CRYSTAL_CELLS - CRYSTAL_GRID) next.push(index + CRYSTAL_GRID);
  if (col > 0) next.push(index - 1);
  if (col < CRYSTAL_GRID - 1) next.push(index + 1);
  return next;
}

function spinPayout(rand: () => number, scale: number): number {
  const board: GemKind[] = [];
  for (let i = 0; i < CRYSTAL_CELLS; i += 1) board.push(nextKind(rand));
  let total = 0;
  let winIndex = 0;
  for (let safety = 0; safety < 20; safety += 1) {
    const seen = new Array<boolean>(CRYSTAL_CELLS).fill(false);
    const exploding = new Array<boolean>(CRYSTAL_CELLS).fill(false);
    let clusterSum = 0;
    let has = false;
    for (let start = 0; start < CRYSTAL_CELLS; start += 1) {
      if (seen[start]) continue;
      const kind = board[start];
      const queue = [start];
      const indices: number[] = [];
      seen[start] = true;
      while (queue.length > 0) {
        const cur = queue.pop() as number;
        indices.push(cur);
        for (const nb of neighbors(cur)) {
          if (!seen[nb] && board[nb] === kind) {
            seen[nb] = true;
            queue.push(nb);
          }
        }
      }
      if (indices.length >= CRYSTAL_MIN_CLUSTER) {
        has = true;
        clusterSum += crystalClusterMult(kind, indices.length);
        for (const idx of indices) exploding[idx] = true;
      }
    }
    if (!has) break;
    total += clusterSum * crystalCombo(winIndex) * scale;
    const next: GemKind[] = new Array(CRYSTAL_CELLS);
    for (let col = 0; col < CRYSTAL_GRID; col += 1) {
      const stack: GemKind[] = [];
      for (let row = CRYSTAL_GRID - 1; row >= 0; row -= 1) {
        const i = row * CRYSTAL_GRID + col;
        if (!exploding[i]) stack.push(board[i]);
      }
      for (let i = 0; i < stack.length; i += 1) {
        next[(CRYSTAL_GRID - 1 - i) * CRYSTAL_GRID + col] = stack[i];
      }
      for (let row = 0; row < CRYSTAL_GRID - stack.length; row += 1) {
        next[row * CRYSTAL_GRID + col] = nextKind(rand);
      }
    }
    for (let i = 0; i < CRYSTAL_CELLS; i += 1) board[i] = next[i];
    winIndex += 1;
  }
  return Number(total.toFixed(4));
}

export function simulateCrystalRtp(input?: {
  rounds?: number;
  seed?: number;
  scale?: number;
}): {
  rounds: number;
  seed: number;
  scale: number;
  totalWagered: number;
  totalPayout: number;
  rtp: number;
  houseEdge: number;
  variance: number;
  stderr: number;
} {
  const rounds = input?.rounds ?? CRYSTAL_SIM_ROUNDS;
  const seed = input?.seed ?? CRYSTAL_SIM_SEED;
  const scale = input?.scale ?? CRYSTAL_PAYOUT_SCALE;
  const rand = mulberry32(seed);
  let totalPayout = 0;
  let mean = 0;
  let m2 = 0;
  for (let i = 0; i < rounds; i += 1) {
    const p = spinPayout(rand, scale);
    totalPayout += p;
    const n = i + 1;
    const delta = p - mean;
    mean += delta / n;
    m2 += delta * (p - mean);
  }
  const rtp = totalPayout / rounds;
  const variance = rounds > 0 ? m2 / rounds : 0;
  return {
    rounds,
    seed,
    scale,
    totalWagered: rounds,
    totalPayout,
    rtp,
    houseEdge: 1 - rtp,
    variance,
    stderr: Math.sqrt(variance / rounds),
  };
}
