export const BLACKJACK_MATH_VERSION = 'blackjack-v2-rtp875';
export const BLACKJACK_WIN_PAYOUT = 1.84;
export const BLACKJACK_GOLDEN_PAYOUT = 2;
export const BLACKJACK_PUSH_PAYOUT = 1;
export const BLACKJACK_EVAL_ROUNDS = 250_000;
export const BLACKJACK_EVAL_SEED = 21031;
export const BLACKJACK_METHOD =
  'Infinite-deck optimal hit/stand DP on the actual 36-card ochko values, then 250000 deterministic finite-shoe hands.';

const VALUES = [6, 7, 8, 9, 10, 2, 3, 4, 11] as const;

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

function resultOf(player: number, dealer: number, playerGolden: boolean, dealerGolden: boolean): 'golden' | 'win' | 'push' | 'lose' {
  if (playerGolden) return 'golden';
  if (player > 21) return 'lose';
  if (dealerGolden) return 'lose';
  if (dealer > 21) return 'win';
  if (player > dealer) return 'win';
  if (player === dealer) return 'push';
  return 'lose';
}

const P = 1 / 9;
const VALUE_SET = [...VALUES];

const hitEv: number[][] = [];
const standEv: number[][] = [];
const shouldHit: boolean[][] = [];

function dealerOutcomeDist(up: number): Map<number, number> {
  const dist = new Map<number, number>();
  function rec(total: number, p: number) {
    if (total >= 17) {
      dist.set(total, (dist.get(total) ?? 0) + p);
      return;
    }
    for (const v of VALUE_SET) rec(total + v, p * P);
  }
  rec(up, 1);
  return dist;
}

function standValue(player: number, dealerUp: number): number {
  if (player > 21) return 0;
  const dist = dealerOutcomeDist(dealerUp);
  let ev = 0;
  for (const [dealer, p] of dist) {
    const r = resultOf(player, dealer, false, false);
    if (r === 'win') ev += p * BLACKJACK_WIN_PAYOUT;
    else if (r === 'push') ev += p * BLACKJACK_PUSH_PAYOUT;
  }
  return ev;
}

function buildStrategy() {
  for (let p = 0; p <= 32; p += 1) {
    hitEv[p] = [];
    standEv[p] = [];
    shouldHit[p] = [];
    for (let d = 0; d <= 22; d += 1) {
      standEv[p][d] = p > 21 ? 0 : standValue(p, d);
      hitEv[p][d] = 0;
      shouldHit[p][d] = false;
    }
  }
  for (let p = 21; p >= 2; p -= 1) {
    for (const d of VALUE_SET) {
      let evHit = 0;
      for (const v of VALUE_SET) {
        const next = p + v;
        if (next > 21) evHit += P * 0;
        else {
          const cont = shouldHit[next][d] ? hitEv[next][d] : standEv[next][d];
          evHit += P * cont;
        }
      }
      hitEv[p][d] = evHit;
      shouldHit[p][d] = evHit > standEv[p][d] + 1e-12;
    }
  }
}

buildStrategy();

function drawFromShoe(shoe: number[], rand: () => number): number {
  const i = Math.floor(rand() * shoe.length);
  const v = shoe[i];
  shoe.splice(i, 1);
  return v;
}

export function simulateBlackjackOptimal(rounds = BLACKJACK_EVAL_ROUNDS, seed = BLACKJACK_EVAL_SEED) {
  const rand = mulberry32(seed);
  let wagered = 0;
  let payout = 0;
  const counts = { golden: 0, win: 0, push: 0, lose: 0 };
  for (let n = 0; n < rounds; n += 1) {
    const shoe: number[] = [];
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 4; c += 1) shoe.push(VALUES[r]);
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
    let player = p1 + p2;
    while (player <= 21 && shouldHit[player]?.[d1]) {
      player += drawFromShoe(shoe, rand);
    }
    if (player > 21) {
      counts.lose += 1;
      continue;
    }
    if (dealerGolden) {
      counts.lose += 1;
      continue;
    }
    let dealer = d1 + d2;
    while (dealer < 17) dealer += drawFromShoe(shoe, rand);
    const r = resultOf(player, dealer, false, false);
    counts[r] += 1;
    if (r === 'win') payout += BLACKJACK_WIN_PAYOUT;
    else if (r === 'push') payout += BLACKJACK_PUSH_PAYOUT;
  }
  const rtp = payout / wagered;
  return {
    rounds,
    seed,
    method: BLACKJACK_METHOD,
    winPayout: BLACKJACK_WIN_PAYOUT,
    goldenPayout: BLACKJACK_GOLDEN_PAYOUT,
    pushPayout: BLACKJACK_PUSH_PAYOUT,
    counts,
    rtp,
    houseEdge: 1 - rtp,
  };
}
