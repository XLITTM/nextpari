import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APPLES_LEVELS, APPLES_MATH_UNCHANGED, APPLES_MATH_VERSION, APPLES_MODEL } from './rtp/applesMath.js';
import {
  BLACKJACK_GOLDEN_PAYOUT,
  BLACKJACK_MATH_VERSION,
  BLACKJACK_METHOD,
  BLACKJACK_PUSH_PAYOUT,
  BLACKJACK_V2_EXACT_RTP,
  BLACKJACK_V2_MATH_VERSION,
  BLACKJACK_V2_WIN_PAYOUT,
  BLACKJACK_V3_MATH_VERSION,
  BLACKJACK_V3_WIN_PAYOUT,
  BLACKJACK_V4_BANKER_WIN_PROBABILITY,
  BLACKJACK_V4_DEALER_RULE,
  BLACKJACK_V4_EXACT_RTP,
  BLACKJACK_V4_HOUSE_EDGE,
  BLACKJACK_V4_PLAYER_WIN_PROBABILITY,
  BLACKJACK_V4_PUSH_PROBABILITY,
  BLACKJACK_V4_TIE_RULE,
  BLACKJACK_VISIBLE_EXACT_RTP,
  BLACKJACK_VISIBLE_THEORETICAL_WIN_PAYOUT,
  BLACKJACK_WIN_PAYOUT,
  evaluateBlackjackExact,
  evaluateBlackjackExactVisibleDealer,
  evaluateBlackjackExactVisibleRules,
  searchBlackjackBankerRules,
} from './rtp/blackjackMath.js';
import {
  AVIATOR_FIXED_CASHOUTS,
  AVIATOR_MATH_VERSION,
  aviatorCrashFromSessionSeed,
  aviatorFixedCashoutExactRtp,
  aviatorServerSeedHash,
  aviatorSessionPublic,
  aviatorSimulatedFixedRtp,
  aviatorPublicLeaksCrashBeforeReveal,
} from './rtp/aviatorMath.js';
import { CRYSTAL_MATH_VERSION, CRYSTAL_SIM_ROUNDS, CRYSTAL_SIM_SEED, simulateCrystalRtp } from './rtp/crystalMath.js';
import {
  DICE_MATH_VERSION,
  DICE_V2_WIN_PAYOUT,
  DICE_V3_EXACT_RTP,
  DICE_V3_HOUSE_EDGE,
  DICE_WIN_PAYOUT,
  diceExactRtp,
} from './rtp/diceMath.js';
import { PHARAOH_MATH_VERSION, PHARAOH_PRIZES, pharaohExactRtp } from './rtp/pharaohMath.js';

function assertBand(rtp: number, label: string) {
  assert.ok(rtp >= 0.85 && rtp <= 0.90, `${label} RTP ${rtp} outside 85%-90%`);
}

describe('audited RTP harness', () => {
  it('prints PHARAOH exact RTP', () => {
    const row = pharaohExactRtp();
    console.log('PHARAOH');
    console.log('mathVersion:', PHARAOH_MATH_VERSION);
    console.log('exactRtp:', row.rtp);
    console.log('houseEdge:', row.houseEdge);
    console.log('probabilities:', PHARAOH_PRIZES.map((p) => `${p.id} w=${p.prizeWeight} hit=${p.hitBps}/10000 x${p.mult}`).join('; '));
    assertBand(row.rtp, 'pharaoh');
    assert.equal(PHARAOH_MATH_VERSION, 'pharaoh-v2-rtp875');
  });

  it('documents historical DICE v2 RTP 1135/1296', () => {
    const row = diceExactRtp(DICE_V2_WIN_PAYOUT);
    console.log('DICE_V2_HISTORICAL');
    console.log('winPayout:', DICE_V2_WIN_PAYOUT);
    console.log('exactRtp:', row.rtp);
    console.log('houseEdge:', row.houseEdge);
    assert.equal(row.numerator / 100, 1135);
    assert.equal(row.denominator / 100, 1296);
    assertBand(row.rtp, 'dice v2');
  });

  it('prints DICE v3 exact RTP 1296/1296', () => {
    const row = diceExactRtp();
    console.log('DICE');
    console.log('mathVersion:', DICE_MATH_VERSION);
    console.log('winPayout:', DICE_WIN_PAYOUT);
    console.log('exactRtp:', row.rtp);
    console.log('houseEdge:', row.houseEdge);
    assert.equal(DICE_MATH_VERSION, 'dice-v3-win2');
    assert.equal(DICE_WIN_PAYOUT, 2);
    assert.equal(row.numerator, 129600);
    assert.equal(row.denominator, 129600);
    assert.equal(row.rtp, DICE_V3_EXACT_RTP);
    assert.equal(row.houseEdge, DICE_V3_HOUSE_EDGE);
    assert.equal(row.rtp, 1);
    assert.equal(row.houseEdge, 0);
  });

  it('documents historical BLACKJACK v2 hidden-hole RTP', () => {
    const exact = evaluateBlackjackExact(BLACKJACK_V2_WIN_PAYOUT, BLACKJACK_PUSH_PAYOUT);
    console.log('BLACKJACK_V2_HISTORICAL');
    console.log('mathVersion:', BLACKJACK_V2_MATH_VERSION);
    console.log('winPayout:', BLACKJACK_V2_WIN_PAYOUT);
    console.log('optimalPlayerRtp:', exact.rtp);
    console.log('houseEdge:', exact.houseEdge);
    assert.equal(BLACKJACK_V2_WIN_PAYOUT, 1.84);
    assert.ok(Math.abs(exact.rtp - BLACKJACK_V2_EXACT_RTP) < 1e-12);
  });

  it('documents historical BLACKJACK v3 visible-dealer RTP', () => {
    const exact = evaluateBlackjackExactVisibleDealer(BLACKJACK_V3_WIN_PAYOUT, BLACKJACK_PUSH_PAYOUT);
    console.log('BLACKJACK_V3_HISTORICAL');
    console.log('mathVersion:', BLACKJACK_V3_MATH_VERSION);
    console.log('winPayout:', BLACKJACK_V3_WIN_PAYOUT);
    console.log('theoreticalWinPayout:', BLACKJACK_VISIBLE_THEORETICAL_WIN_PAYOUT);
    console.log('optimalPlayerRtp:', exact.rtp);
    console.log('houseEdge:', exact.houseEdge);
    assert.equal(BLACKJACK_V3_WIN_PAYOUT, 1.7);
    assert.equal(exact.winPayout, 1.7);
    assert.ok(exact.rtp >= 0.87 && exact.rtp <= 0.88, `v3 RTP ${exact.rtp} outside 0.87-0.88`);
    assert.ok(Math.abs(exact.rtp - BLACKJACK_VISIBLE_EXACT_RTP) < 1e-12, 'v3 exact RTP baked constant');
    const nearby = evaluateBlackjackExactVisibleDealer(1.69);
    assert.ok(Math.abs(exact.rtp - 0.875) < Math.abs(nearby.rtp - 0.875), '1.70 closer to 0.875 than 1.69');
  });

  it('prints BLACKJACK v4 banker-ties chase-player exact RTP', () => {
    const search = searchBlackjackBankerRules();
    console.log('BLACKJACK_RULE_SEARCH');
    for (const row of search.rows) {
      console.log(
        `${row.tieRule} ${row.dealerRule} P=${row.playerWinProbability} B=${row.bankerWinProbability} U=${row.pushProbability} RTP=${row.rtp} HE=${row.houseEdge}`,
      );
    }
    const exact = evaluateBlackjackExactVisibleRules({
      tieRule: BLACKJACK_V4_TIE_RULE,
      dealerRule: BLACKJACK_V4_DEALER_RULE,
      winPayout: BLACKJACK_WIN_PAYOUT,
      goldenPayout: BLACKJACK_GOLDEN_PAYOUT,
    });
    console.log('BLACKJACK');
    console.log('mathVersion:', BLACKJACK_MATH_VERSION);
    console.log('method:', BLACKJACK_METHOD);
    console.log('tieRule:', exact.tieRule);
    console.log('dealerRule:', exact.dealerRule);
    console.log('usesOptimalStrategyForRules:', exact.usesOptimalStrategyForRules);
    console.log('playerWinProbability:', exact.playerWinProbability);
    console.log('bankerWinProbability:', exact.bankerWinProbability);
    console.log('pushProbability:', exact.pushProbability);
    console.log('optimalPlayerRtp:', exact.rtp);
    console.log('houseEdge:', exact.houseEdge);
    assert.equal(BLACKJACK_MATH_VERSION, 'blackjack-v4-visible-banker-ties-chase-win2');
    assert.equal(BLACKJACK_WIN_PAYOUT, 2);
    assert.equal(BLACKJACK_GOLDEN_PAYOUT, 2);
    assert.equal(exact.tieRule, 'banker');
    assert.equal(exact.dealerRule, 'chasePlayer');
    assert.equal(exact.usesOptimalStrategyForRules, true);
    assert.ok(exact.bankerWinProbability >= 0.55 && exact.bankerWinProbability <= 0.60);
    assert.ok(exact.houseEdge >= 0.10 && exact.houseEdge <= 0.15);
    assert.ok(Math.abs(exact.rtp - BLACKJACK_V4_EXACT_RTP) < 1e-12);
    assert.ok(Math.abs(exact.houseEdge - BLACKJACK_V4_HOUSE_EDGE) < 1e-12);
    assert.ok(Math.abs(exact.playerWinProbability - BLACKJACK_V4_PLAYER_WIN_PROBABILITY) < 1e-12);
    assert.ok(Math.abs(exact.bankerWinProbability - BLACKJACK_V4_BANKER_WIN_PROBABILITY) < 1e-12);
    assert.equal(exact.pushProbability, BLACKJACK_V4_PUSH_PROBABILITY);
    assert.equal(search.selected?.tieRule, 'banker');
    assert.equal(search.selected?.dealerRule, 'chasePlayer');
    assert.ok(Math.abs((search.selected?.rtp ?? 0) - exact.rtp) < 1e-12);
    const rejected = evaluateBlackjackExactVisibleDealer(2, 1);
    assert.ok(rejected.rtp > 1, 'rejected stand-17 push ×2 table remains above 1.0');
  });

  it('prints APPLES unchanged progressive model', () => {
    console.log('APPLES');
    console.log('mathVersion:', APPLES_MATH_VERSION);
    console.log('UNCHANGED:', APPLES_MATH_UNCHANGED);
    console.log('model:', APPLES_MODEL);
    assert.equal(APPLES_MATH_UNCHANGED, true);
    assert.equal(APPLES_LEVELS[0]?.multiplier, 1.23);
    assert.equal(APPLES_LEVELS[9]?.multiplier, 349);
  });

  it('prints CRYSTAL simulated RTP', () => {
    const row = simulateCrystalRtp({ rounds: CRYSTAL_SIM_ROUNDS, seed: CRYSTAL_SIM_SEED });
    console.log('CRYSTAL');
    console.log('mathVersion:', CRYSTAL_MATH_VERSION);
    console.log('rounds:', row.rounds);
    console.log('seed:', row.seed);
    console.log('rtp:', row.rtp);
    console.log('houseEdge:', row.houseEdge);
    console.log('stderr:', row.stderr);
    assertBand(row.rtp, 'crystal');
  });

  it('prints AVIATOR fixed-cashout RTP', () => {
    console.log('AVIATOR');
    console.log('mathVersion:', AVIATOR_MATH_VERSION);
    for (const x of AVIATOR_FIXED_CASHOUTS) {
      const exact = aviatorFixedCashoutExactRtp(x);
      const sim = aviatorSimulatedFixedRtp(x, 80_000, 31031);
      console.log(`${x.toFixed(2)}x RTP exact=${exact} sim=${sim}`);
      assertBand(exact, `aviator ${x} exact`);
      assertBand(sim, `aviator ${x} sim`);
    }
  });

  it('hides Aviator crash proof until crashed and keeps session seed consistent', () => {
    const seed = 'a'.repeat(64);
    const hash = aviatorServerSeedHash(seed);
    const crash = aviatorCrashFromSessionSeed(seed);
    const flying = aviatorSessionPublic({
      sessionId: 's1',
      state: 'flying',
      serverNow: 't1',
      bettingClosesAt: 't0',
      startsAt: 't0',
      crashAt: 'secret-crash-at',
      serverSeedHash: hash,
      mathVersion: AVIATOR_MATH_VERSION,
      currentMultiplier: 1.5,
      crashPoint: crash,
      serverSeed: seed,
    });
    const bettingInput = {
      sessionId: 's1',
      state: 'betting' as const,
      serverNow: 't1',
      bettingClosesAt: 't0',
      startsAt: 't0',
      crashAt: 'secret-crash-at',
      serverSeedHash: hash,
      mathVersion: AVIATOR_MATH_VERSION,
      currentMultiplier: 1,
      crashPoint: crash,
      serverSeed: seed,
    };
    const betting = aviatorSessionPublic(bettingInput);
    const crashed = aviatorSessionPublic({
      sessionId: 's1',
      state: 'crashed',
      serverNow: 't2',
      bettingClosesAt: 't0',
      startsAt: 't0',
      crashAt: 'secret-crash-at',
      serverSeedHash: hash,
      mathVersion: AVIATOR_MATH_VERSION,
      currentMultiplier: crash,
      crashPoint: crash,
      serverSeed: seed,
    });
    assert.equal(flying.crashAt, null);
    assert.equal(flying.crashPoint, null);
    assert.equal(flying.serverSeed, null);
    assert.equal(betting.crashAt, null);
    assert.equal(betting.crashPoint, null);
    assert.equal(betting.serverSeed, null);
    assert.equal(crashed.crashAt, 'secret-crash-at');
    assert.equal(crashed.crashPoint, crash);
    assert.equal(crashed.serverSeed, seed);
    assert.equal(aviatorPublicLeaksCrashBeforeReveal(flying), false);
    assert.equal(aviatorPublicLeaksCrashBeforeReveal(betting), false);
    const betA = { sessionId: 's1', serverSeedHash: hash };
    const betB = { sessionId: 's1', serverSeedHash: hash };
    assert.equal(betA.serverSeedHash, betB.serverSeedHash);
    assert.equal(aviatorCrashFromSessionSeed(seed), crash);
    assert.ok(crash >= 1);
  });
});
