import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DICE_V2_MATH_VERSION,
  DICE_V3_MATH_VERSION,
  DiceMathVersionError,
  dicePayoutForVersion,
} from './dicePayout.js';

describe('dice v2 to v3 cutover', () => {
  it('pays v2 win ×1.72 after catalog has moved to v3', () => {
    assert.equal(dicePayoutForVersion(10, 'win', DICE_V2_MATH_VERSION), 17.2);
    assert.equal(dicePayoutForVersion(10, 'draw', DICE_V2_MATH_VERSION), 10);
    assert.equal(dicePayoutForVersion(10, 'lose', DICE_V2_MATH_VERSION), 0);
  });

  it('pays v3 win ×2.00 with draw ×1.00', () => {
    assert.equal(dicePayoutForVersion(10, 'win', DICE_V3_MATH_VERSION), 20);
    assert.equal(dicePayoutForVersion(10, 'draw', DICE_V3_MATH_VERSION), 10);
    assert.equal(dicePayoutForVersion(10, 'lose', DICE_V3_MATH_VERSION), 0);
  });

  it('rejects unknown and missing math versions', () => {
    assert.throws(
      () => dicePayoutForVersion(10, 'win', 'dice-v9-unknown'),
      (error: unknown) => error instanceof DiceMathVersionError && error.code === 'DICE_MATH_VERSION_UNSUPPORTED',
    );
    assert.throws(
      () => dicePayoutForVersion(10, 'win', null),
      (error: unknown) => error instanceof DiceMathVersionError && error.code === 'DICE_MATH_VERSION_MISSING',
    );
    assert.throws(
      () => dicePayoutForVersion(10, 'draw', ''),
      (error: unknown) => error instanceof DiceMathVersionError && error.code === 'DICE_MATH_VERSION_MISSING',
    );
  });
});
