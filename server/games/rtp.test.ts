import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APPLES_LEVELS, APPLES_MATH_UNCHANGED, APPLES_MATH_VERSION, APPLES_MODEL } from './rtp/applesMath.js';
import { AVIATOR_FIXED_CASHOUTS, AVIATOR_MATH_VERSION, aviatorFixedCashoutExactRtp, aviatorSimulatedFixedRtp } from './rtp/aviatorMath.js';
import {
  BLACKJACK_GOLDEN_PAYOUT,
  BLACKJACK_MATH_VERSION,
  BLACKJACK_METHOD,
  BLACKJACK_WIN_PAYOUT,
  simulateBlackjackOptimal,
} from './rtp/blackjackMath.js';
import { CRYSTAL_MATH_VERSION, CRYSTAL_SIM_ROUNDS, CRYSTAL_SIM_SEED, simulateCrystalRtp } from './rtp/crystalMath.js';
import { DICE_MATH_VERSION, diceExactRtp } from './rtp/diceMath.js';
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

  it('prints DICE exact RTP 1135/1296', () => {
    const row = diceExactRtp();
    console.log('DICE');
    console.log('mathVersion:', DICE_MATH_VERSION);
    console.log('exactRtp:', row.rtp);
    console.log('houseEdge:', row.houseEdge);
    assert.equal(row.numerator / 100, 1135);
    assert.equal(row.denominator / 100, 1296);
    assertBand(row.rtp, 'dice');
  });

  it('prints BLACKJACK optimal-strategy RTP', () => {
    const row = simulateBlackjackOptimal();
    console.log('BLACKJACK');
    console.log('mathVersion:', BLACKJACK_MATH_VERSION);
    console.log('method:', BLACKJACK_METHOD);
    console.log('optimalPlayerRtp:', row.rtp);
    console.log('houseEdge:', row.houseEdge);
    console.log('paytable:', `win=${BLACKJACK_WIN_PAYOUT} golden=${BLACKJACK_GOLDEN_PAYOUT} push=1`);
    assertBand(row.rtp, 'blackjack');
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
});
