export const BLACKJACK_V2_MATH_VERSION = 'blackjack-v2-rtp875';
export const BLACKJACK_V2_WIN_PAYOUT = 1.84;
export const BLACKJACK_V2_EXACT_RTP = 0.875492820201475;
export const BLACKJACK_MATH_VERSION = 'blackjack-v3-visible-dealer-rtp875';
export const BLACKJACK_WIN_PAYOUT = 1.7;
export const BLACKJACK_GOLDEN_PAYOUT = 2;
export const BLACKJACK_PUSH_PAYOUT = 1;
export const BLACKJACK_VISIBLE_THEORETICAL_WIN_PAYOUT = 1.6952395194023846;
export const BLACKJACK_VISIBLE_EXACT_RTP = 0.8771651467167154;
export const BLACKJACK_EVAL_ROUNDS = 25_000;
export const BLACKJACK_EVAL_SEED = 21031;
export const BLACKJACK_V2_METHOD =
  'Exact finite-shoe DP: 36-card shoe (4 of each rank), composition-dependent hit/stand, unknown dealer hole mixed into remaining counts, dealer draws to 17, no soft-Ace, AA golden.';
export const BLACKJACK_METHOD =
  'Exact finite-shoe DP with both initial dealer cards visible. 36-card shoe, composition-dependent hit/stand, dealer draws to 17, AA golden, win×1.70 golden×2 push×1.';

const RANKS = 9;
const VALUES = [6, 7, 8, 9, 10, 2, 3, 4, 11] as const;
const ACE = 8;
const FULL_SHOE = 36;
const PREFIXES = 36 * 35 * 34;

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

function pack(c: Uint8Array): number {
  let p = 0;
  for (let i = 0; i < RANKS; i += 1) p |= (c[i] & 7) << (i * 3);
  return p;
}

function totalCards(c: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < RANKS; i += 1) n += c[i];
  return n;
}

function payoutOf(player: number, dealer: number, winPayout: number, pushPayout: number): number {
  if (player > 21) return 0;
  if (dealer > 21) return winPayout;
  if (player > dealer) return winPayout;
  if (player === dealer) return pushPayout;
  return 0;
}

type Solver = {
  valueMemo: Map<number, number>;
  dealerMemo: Map<number, number>;
  winPayout: number;
  pushPayout: number;
};

function keyValue(packed: number, player: number, upIdx: number): number {
  return packed + player * 0x8000000 + upIdx * 0x200000000;
}

function keyDealer(packed: number, dealerTotal: number, player: number): number {
  return packed + dealerTotal * 0x8000000 + player * 0x200000000;
}

function dealerPlay(solver: Solver, dealerTotal: number, counts: Uint8Array, player: number): number {
  if (dealerTotal > 21) return solver.winPayout;
  if (dealerTotal >= 17) return payoutOf(player, dealerTotal, solver.winPayout, solver.pushPayout);
  const packed = pack(counts);
  const k = keyDealer(packed, dealerTotal, player);
  const hit = solver.dealerMemo.get(k);
  if (hit !== undefined) return hit;
  const n = totalCards(counts);
  let ev = 0;
  if (n <= 0) {
    ev = payoutOf(player, dealerTotal, solver.winPayout, solver.pushPayout);
  } else {
    for (let r = 0; r < RANKS; r += 1) {
      const c = counts[r];
      if (!c) continue;
      counts[r] = c - 1;
      ev += (c / n) * dealerPlay(solver, dealerTotal + VALUES[r], counts, player);
      counts[r] = c;
    }
  }
  solver.dealerMemo.set(k, ev);
  return ev;
}

function standEv(solver: Solver, player: number, upIdx: number, counts: Uint8Array): number {
  if (player > 21) return 0;
  const n = totalCards(counts);
  if (n <= 0) return 0;
  let ev = 0;
  for (let hole = 0; hole < RANKS; hole += 1) {
    const c = counts[hole];
    if (!c) continue;
    const p = c / n;
    counts[hole] = c - 1;
    if (upIdx === ACE && hole === ACE) {
      ev += p * 0;
    } else {
      ev += p * dealerPlay(solver, VALUES[upIdx] + VALUES[hole], counts, player);
    }
    counts[hole] = c;
  }
  return ev;
}

function hitEv(solver: Solver, player: number, upIdx: number, counts: Uint8Array): number {
  const n = totalCards(counts);
  if (n <= 0) return standEv(solver, player, upIdx, counts);
  let ev = 0;
  for (let r = 0; r < RANKS; r += 1) {
    const c = counts[r];
    if (!c) continue;
    counts[r] = c - 1;
    const next = player + VALUES[r];
    ev += (c / n) * (next > 21 ? 0 : valueOf(solver, next, upIdx, counts));
    counts[r] = c;
  }
  return ev;
}

function valueOf(solver: Solver, player: number, upIdx: number, counts: Uint8Array): number {
  if (player > 21) return 0;
  const packed = pack(counts);
  const k = keyValue(packed, player, upIdx);
  const cached = solver.valueMemo.get(k);
  if (cached !== undefined) return cached;
  const stand = standEv(solver, player, upIdx, counts);
  let ev = stand;
  if (player < 21) {
    const hit = hitEv(solver, player, upIdx, counts);
    if (hit > stand) ev = hit;
  }
  solver.valueMemo.set(k, ev);
  return ev;
}

function shouldHit(solver: Solver, player: number, upIdx: number, counts: Uint8Array): boolean {
  if (player >= 21) return false;
  return hitEv(solver, player, upIdx, counts) > standEv(solver, player, upIdx, counts) + 1e-15;
}

export function evaluateBlackjackExact(winPayout = BLACKJACK_V2_WIN_PAYOUT, pushPayout = BLACKJACK_PUSH_PAYOUT) {
  const solver: Solver = {
    valueMemo: new Map(),
    dealerMemo: new Map(),
    winPayout,
    pushPayout,
  };
  const counts = new Uint8Array(RANKS).fill(4);
  let weighted = 0;
  for (let p1 = 0; p1 < RANKS; p1 += 1) {
    const w1 = counts[p1];
    if (!w1) continue;
    counts[p1] = w1 - 1;
    for (let dUp = 0; dUp < RANKS; dUp += 1) {
      const w2 = counts[dUp];
      if (!w2) continue;
      counts[dUp] = w2 - 1;
      for (let p2 = 0; p2 < RANKS; p2 += 1) {
        const w3 = counts[p2];
        if (!w3) continue;
        const w = w1 * w2 * w3;
        counts[p2] = w3 - 1;
        if (p1 === ACE && p2 === ACE) {
          weighted += w * BLACKJACK_GOLDEN_PAYOUT;
        } else {
          weighted += w * valueOf(solver, VALUES[p1] + VALUES[p2], dUp, counts);
        }
        counts[p2] = w3;
      }
      counts[dUp] = w2;
    }
    counts[p1] = w1;
  }
  const rtp = weighted / PREFIXES;
  return {
    method: BLACKJACK_V2_METHOD,
    prefixes: PREFIXES,
    fullShoe: FULL_SHOE,
    valueStates: solver.valueMemo.size,
    dealerStates: solver.dealerMemo.size,
    stateCount: solver.valueMemo.size + solver.dealerMemo.size,
    winPayout,
    goldenPayout: BLACKJACK_GOLDEN_PAYOUT,
    pushPayout,
    rtp,
    houseEdge: 1 - rtp,
  };
}

const VISIBLE_PREFIXES = 36 * 35 * 34 * 33;

function keyValueKnown(packed: number, player: number, dealerTotal: number): number {
  return packed + player * 0x8000000 + dealerTotal * 0x200000000;
}

function hitKnownEv(solver: Solver, player: number, dealerTotal: number, counts: Uint8Array): number {
  const n = totalCards(counts);
  if (n <= 0) return dealerPlay(solver, dealerTotal, counts, player);
  let ev = 0;
  for (let r = 0; r < RANKS; r += 1) {
    const c = counts[r];
    if (!c) continue;
    counts[r] = c - 1;
    const next = player + VALUES[r];
    ev += (c / n) * (next > 21 ? 0 : valueKnownDealer(solver, next, dealerTotal, counts));
    counts[r] = c;
  }
  return ev;
}

function valueKnownDealer(solver: Solver, player: number, dealerTotal: number, counts: Uint8Array): number {
  if (player > 21) return 0;
  const packed = pack(counts);
  const k = keyValueKnown(packed, player, dealerTotal);
  const cached = solver.valueMemo.get(k);
  if (cached !== undefined) return cached;
  const stand = dealerPlay(solver, dealerTotal, counts, player);
  let ev = stand;
  if (player < 21) {
    const hit = hitKnownEv(solver, player, dealerTotal, counts);
    if (hit > stand) ev = hit;
  }
  solver.valueMemo.set(k, ev);
  return ev;
}

/**
 * Optimal RTP when the player sees both initial dealer cards.
 * Active v3 model. Normal-win payout is the only calibrated economic parameter.
 */
export function evaluateBlackjackExactVisibleDealer(
  winPayout = BLACKJACK_WIN_PAYOUT,
  pushPayout = BLACKJACK_PUSH_PAYOUT,
) {
  const solver: Solver = {
    valueMemo: new Map(),
    dealerMemo: new Map(),
    winPayout,
    pushPayout,
  };
  const counts = new Uint8Array(RANKS).fill(4);
  let weighted = 0;
  for (let p1 = 0; p1 < RANKS; p1 += 1) {
    const w1 = counts[p1];
    if (!w1) continue;
    counts[p1] = w1 - 1;
    for (let d1 = 0; d1 < RANKS; d1 += 1) {
      const w2 = counts[d1];
      if (!w2) continue;
      counts[d1] = w2 - 1;
      for (let p2 = 0; p2 < RANKS; p2 += 1) {
        const w3 = counts[p2];
        if (!w3) continue;
        counts[p2] = w3 - 1;
        for (let d2 = 0; d2 < RANKS; d2 += 1) {
          const w4 = counts[d2];
          if (!w4) continue;
          const w = w1 * w2 * w3 * w4;
          counts[d2] = w4 - 1;
          if (p1 === ACE && p2 === ACE) {
            weighted += w * BLACKJACK_GOLDEN_PAYOUT;
          } else if (d1 === ACE && d2 === ACE) {
            weighted += w * 0;
          } else {
            weighted += w * valueKnownDealer(
              solver,
              VALUES[p1] + VALUES[p2],
              VALUES[d1] + VALUES[d2],
              counts,
            );
          }
          counts[d2] = w4;
        }
        counts[p2] = w3;
      }
      counts[d1] = w2;
    }
    counts[p1] = w1;
  }
  const rtp = weighted / VISIBLE_PREFIXES;
  return {
    method: BLACKJACK_METHOD,
    prefixes: VISIBLE_PREFIXES,
    fullShoe: FULL_SHOE,
    valueStates: solver.valueMemo.size,
    dealerStates: solver.dealerMemo.size,
    stateCount: solver.valueMemo.size + solver.dealerMemo.size,
    winPayout,
    goldenPayout: BLACKJACK_GOLDEN_PAYOUT,
    pushPayout,
    rtp,
    houseEdge: 1 - rtp,
  };
}

function drawFromShoe(shoe: number[], rand: () => number): number {
  const i = Math.floor(rand() * shoe.length);
  const v = shoe[i];
  shoe.splice(i, 1);
  return v;
}

function countsFromShoe(shoe: number[], extra: number[] = []): Uint8Array {
  const c = new Uint8Array(RANKS);
  for (const v of shoe) c[VALUES.indexOf(v as (typeof VALUES)[number])] += 1;
  for (const v of extra) c[VALUES.indexOf(v as (typeof VALUES)[number])] += 1;
  return c;
}

function shouldHitKnown(solver: Solver, player: number, dealerTotal: number, counts: Uint8Array): boolean {
  if (player >= 21) return false;
  return hitKnownEv(solver, player, dealerTotal, counts) > dealerPlay(solver, dealerTotal, counts, player) + 1e-15;
}

export function simulateBlackjackOptimal(rounds = BLACKJACK_EVAL_ROUNDS, seed = BLACKJACK_EVAL_SEED) {
  const solver: Solver = {
    valueMemo: new Map(),
    dealerMemo: new Map(),
    winPayout: BLACKJACK_WIN_PAYOUT,
    pushPayout: BLACKJACK_PUSH_PAYOUT,
  };
  const rand = mulberry32(seed);
  let wagered = 0;
  let payout = 0;
  const counts = { golden: 0, win: 0, push: 0, lose: 0 };
  for (let n = 0; n < rounds; n += 1) {
    const shoe: number[] = [];
    for (let r = 0; r < RANKS; r += 1) {
      for (let copy = 0; copy < 4; copy += 1) shoe.push(VALUES[r]);
    }
    const p1 = drawFromShoe(shoe, rand);
    const d1 = drawFromShoe(shoe, rand);
    const p2 = drawFromShoe(shoe, rand);
    const d2 = drawFromShoe(shoe, rand);
    const playerGolden = p1 === 11 && p2 === 11;
    const dealerGolden = d1 === 11 && d2 === 11;
    wagered += 1;
    if (playerGolden) {
      payout += BLACKJACK_GOLDEN_PAYOUT;
      counts.golden += 1;
      continue;
    }
    if (dealerGolden) {
      counts.lose += 1;
      continue;
    }
    let player = p1 + p2;
    const dealerTotal = d1 + d2;
    while (player <= 21 && shouldHitKnown(solver, player, dealerTotal, countsFromShoe(shoe))) {
      player += drawFromShoe(shoe, rand);
    }
    if (player > 21) {
      counts.lose += 1;
      continue;
    }
    let dealer = dealerTotal;
    while (dealer < 17) dealer += drawFromShoe(shoe, rand);
    if (dealer > 21 || player > dealer) {
      counts.win += 1;
      payout += BLACKJACK_WIN_PAYOUT;
    } else if (player === dealer) {
      counts.push += 1;
      payout += BLACKJACK_PUSH_PAYOUT;
    } else {
      counts.lose += 1;
    }
  }
  const rtp = payout / wagered;
  return {
    rounds,
    seed,
    method: `${BLACKJACK_METHOD} Then ${rounds} deterministic finite-shoe hands using the same solver.`,
    winPayout: BLACKJACK_WIN_PAYOUT,
    goldenPayout: BLACKJACK_GOLDEN_PAYOUT,
    pushPayout: BLACKJACK_PUSH_PAYOUT,
    counts,
    rtp,
    houseEdge: 1 - rtp,
    valueStates: solver.valueMemo.size,
    dealerStates: solver.dealerMemo.size,
    stateCount: solver.valueMemo.size + solver.dealerMemo.size,
  };
}
