export const BLACKJACK_V2_MATH_VERSION = 'blackjack-v2-rtp875';
export const BLACKJACK_V2_WIN_PAYOUT = 1.84;
export const BLACKJACK_V2_EXACT_RTP = 0.875492820201475;
export const BLACKJACK_V3_MATH_VERSION = 'blackjack-v3-visible-dealer-rtp875';
export const BLACKJACK_V3_WIN_PAYOUT = 1.7;
export const BLACKJACK_MATH_VERSION = 'blackjack-v4-visible-banker-ties-chase-win2';
export const BLACKJACK_WIN_PAYOUT = 2;
export const BLACKJACK_GOLDEN_PAYOUT = 2;
export const BLACKJACK_PUSH_PAYOUT = 1;
export const BLACKJACK_VISIBLE_THEORETICAL_WIN_PAYOUT = 1.6952395194023846;
export const BLACKJACK_VISIBLE_EXACT_RTP = 0.8771651467167154;
export const BLACKJACK_V4_TIE_RULE = 'banker' as const;
export const BLACKJACK_V4_DEALER_RULE = 'chasePlayer' as const;
export const BLACKJACK_V4_EXACT_RTP = 0.8789735622567584;
export const BLACKJACK_V4_HOUSE_EDGE = 0.12102643774324162;
export const BLACKJACK_V4_PLAYER_WIN_PROBABILITY = 0.4394867811283792;
export const BLACKJACK_V4_BANKER_WIN_PROBABILITY = 0.5605132188716218;
export const BLACKJACK_V4_PUSH_PROBABILITY = 0;
export const BLACKJACK_EVAL_ROUNDS = 25_000;
export const BLACKJACK_EVAL_SEED = 21031;
export const BLACKJACK_V2_METHOD =
  'Exact finite-shoe DP: 36-card shoe (4 of each rank), composition-dependent hit/stand, unknown dealer hole mixed into remaining counts, dealer draws to 17, no soft-Ace, AA golden.';
export const BLACKJACK_V3_METHOD =
  'Exact finite-shoe DP with both initial dealer cards visible. 36-card shoe, composition-dependent hit/stand, dealer draws to 17, AA golden, win×1.70 golden×2 push×1.';
export const BLACKJACK_METHOD =
  'Exact finite-shoe DP with both initial dealer cards visible. 36-card shoe, composition-dependent hit/stand, dealer draws while total < max(17, player) and < 21, banker wins ties, AA golden, win×2.00 golden×2.';

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
 * Active v4 model. Normal-win payout is an explicit product decision, not an 87.5% calibration.
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

export type BlackjackTieRule = 'push' | 'banker';
export type BlackjackDealerRule = 'stand17' | 'stand18' | 'stand19' | 'chasePlayer';

export interface BlackjackVisibleRules {
  tieRule: BlackjackTieRule;
  dealerRule: BlackjackDealerRule;
  winPayout: number;
  goldenPayout: number;
}

type Mass = {
  ev: number;
  pPlayer: number;
  pBanker: number;
  pPush: number;
};

const ZERO: Mass = { ev: 0, pPlayer: 0, pBanker: 0, pPush: 0 };
const PLAYER_WIN = (win: number): Mass => ({ ev: win, pPlayer: 1, pBanker: 0, pPush: 0 });
const BANKER_WIN: Mass = { ev: 0, pPlayer: 0, pBanker: 1, pPush: 0 };
const PUSH: Mass = { ev: 1, pPlayer: 0, pBanker: 0, pPush: 1 };

function addMass(acc: Mass, weight: number, child: Mass): void {
  acc.ev += weight * child.ev;
  acc.pPlayer += weight * child.pPlayer;
  acc.pBanker += weight * child.pBanker;
  acc.pPush += weight * child.pPush;
}

function resolveMass(player: number, dealer: number, rules: BlackjackVisibleRules): Mass {
  if (player > 21) return BANKER_WIN;
  if (dealer > 21) return PLAYER_WIN(rules.winPayout);
  if (player > dealer) return PLAYER_WIN(rules.winPayout);
  if (player === dealer) return rules.tieRule === 'banker' ? BANKER_WIN : PUSH;
  return BANKER_WIN;
}

function dealerShouldDraw(dealerTotal: number, player: number, dealerRule: BlackjackDealerRule): boolean {
  if (dealerTotal >= 21) return false;
  if (dealerRule === 'stand17') return dealerTotal < 17;
  if (dealerRule === 'stand18') return dealerTotal < 18;
  if (dealerRule === 'stand19') return dealerTotal < 19;
  return dealerTotal < Math.max(17, player);
}

type RuleSolver = {
  valueMemo: Map<number, Mass>;
  dealerMemo: Map<number, Mass>;
  rules: BlackjackVisibleRules;
};

function dealerPlayRules(solver: RuleSolver, dealerTotal: number, counts: Uint8Array, player: number): Mass {
  if (dealerTotal > 21) return PLAYER_WIN(solver.rules.winPayout);
  if (!dealerShouldDraw(dealerTotal, player, solver.rules.dealerRule)) {
    return resolveMass(player, dealerTotal, solver.rules);
  }
  const packed = pack(counts);
  const k = keyDealer(packed, dealerTotal, player);
  const hit = solver.dealerMemo.get(k);
  if (hit !== undefined) return hit;
  const n = totalCards(counts);
  const acc: Mass = { ...ZERO };
  if (n <= 0) {
    Object.assign(acc, resolveMass(player, dealerTotal, solver.rules));
  } else {
    for (let r = 0; r < RANKS; r += 1) {
      const c = counts[r];
      if (!c) continue;
      counts[r] = c - 1;
      addMass(acc, c / n, dealerPlayRules(solver, dealerTotal + VALUES[r], counts, player));
      counts[r] = c;
    }
  }
  solver.dealerMemo.set(k, acc);
  return acc;
}

function hitKnownRules(solver: RuleSolver, player: number, dealerTotal: number, counts: Uint8Array): Mass {
  const n = totalCards(counts);
  if (n <= 0) return dealerPlayRules(solver, dealerTotal, counts, player);
  const acc: Mass = { ...ZERO };
  for (let r = 0; r < RANKS; r += 1) {
    const c = counts[r];
    if (!c) continue;
    counts[r] = c - 1;
    const next = player + VALUES[r];
    addMass(
      acc,
      c / n,
      next > 21 ? BANKER_WIN : valueKnownRules(solver, next, dealerTotal, counts),
    );
    counts[r] = c;
  }
  return acc;
}

function valueKnownRules(solver: RuleSolver, player: number, dealerTotal: number, counts: Uint8Array): Mass {
  if (player > 21) return BANKER_WIN;
  const packed = pack(counts);
  const k = keyValueKnown(packed, player, dealerTotal);
  const cached = solver.valueMemo.get(k);
  if (cached !== undefined) return cached;
  const stand = dealerPlayRules(solver, dealerTotal, counts, player);
  let best = stand;
  if (player < 21) {
    const hit = hitKnownRules(solver, player, dealerTotal, counts);
    if (hit.ev > stand.ev) best = hit;
  }
  solver.valueMemo.set(k, best);
  return best;
}

export function evaluateBlackjackExactVisibleRules(rules: BlackjackVisibleRules) {
  const solver: RuleSolver = {
    valueMemo: new Map(),
    dealerMemo: new Map(),
    rules,
  };
  const counts = new Uint8Array(RANKS).fill(4);
  const acc: Mass = { ...ZERO };
  let pGolden = 0;
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
            addMass(acc, w, PLAYER_WIN(rules.goldenPayout));
            pGolden += w;
          } else if (d1 === ACE && d2 === ACE) {
            addMass(acc, w, BANKER_WIN);
          } else {
            addMass(
              acc,
              w,
              valueKnownRules(solver, VALUES[p1] + VALUES[p2], VALUES[d1] + VALUES[d2], counts),
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
  const denom = VISIBLE_PREFIXES;
  const rtp = acc.ev / denom;
  return {
    tieRule: rules.tieRule,
    dealerRule: rules.dealerRule,
    winPayout: rules.winPayout,
    goldenPayout: rules.goldenPayout,
    playerWinProbability: acc.pPlayer / denom,
    bankerWinProbability: acc.pBanker / denom,
    pushProbability: acc.pPush / denom,
    goldenProbability: pGolden / denom,
    rtp,
    houseEdge: 1 - rtp,
    prefixes: denom,
    valueStates: solver.valueMemo.size,
    dealerStates: solver.dealerMemo.size,
    usesOptimalStrategyForRules: true,
  };
}

export const BLACKJACK_RULE_CANDIDATES: Array<{
  tieRule: BlackjackTieRule;
  dealerRule: BlackjackDealerRule;
}> = [
  { tieRule: 'push', dealerRule: 'stand17' },
  { tieRule: 'push', dealerRule: 'stand18' },
  { tieRule: 'push', dealerRule: 'stand19' },
  { tieRule: 'push', dealerRule: 'chasePlayer' },
  { tieRule: 'banker', dealerRule: 'stand17' },
  { tieRule: 'banker', dealerRule: 'stand18' },
  { tieRule: 'banker', dealerRule: 'stand19' },
  { tieRule: 'banker', dealerRule: 'chasePlayer' },
];

const DEALER_RULE_DEVIATION: Record<BlackjackDealerRule, number> = {
  stand17: 0,
  stand18: 1,
  stand19: 2,
  chasePlayer: 3,
};

export function searchBlackjackBankerRules(winPayout = 2, goldenPayout = 2) {
  const rows = BLACKJACK_RULE_CANDIDATES.map((candidate) =>
    evaluateBlackjackExactVisibleRules({
      ...candidate,
      winPayout,
      goldenPayout,
    }),
  );
  const matches = rows.filter(
    (row) =>
      row.bankerWinProbability >= 0.55
      && row.bankerWinProbability <= 0.60
      && row.houseEdge >= 0.10
      && row.houseEdge <= 0.15
      && row.winPayout === 2,
  );
  matches.sort((a, b) => {
    const edge = Math.abs(a.houseEdge - 0.125) - Math.abs(b.houseEdge - 0.125);
    if (edge !== 0) return edge;
    const banker = Math.abs(a.bankerWinProbability - 0.575) - Math.abs(b.bankerWinProbability - 0.575);
    if (banker !== 0) return banker;
    const tieDev = (a.tieRule === 'push' ? 0 : 1) - (b.tieRule === 'push' ? 0 : 1);
    if (tieDev !== 0) return tieDev;
    return DEALER_RULE_DEVIATION[a.dealerRule] - DEALER_RULE_DEVIATION[b.dealerRule];
  });
  return { rows, selected: matches[0] ?? null };
}
