import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BlackjackMathVersionError,
  blackjackPayoutForVersion,
} from './blackjackPayout.js';
import {
  BLACKJACK_V2_MATH_VERSION,
  BLACKJACK_V3_MATH_VERSION,
  BLACKJACK_V4_MATH_VERSION,
  parseDealerCards,
  parsePlayerCards,
} from '../../src/games/blackjack/parseHands.js';

const hiddenHole = [
  { suit: '♠', rank: '10', value: 10, isHidden: false },
  { suit: '♥', rank: '7', value: 7, isHidden: true },
];

describe('blackjack v2/v3/v4 cutover', () => {
  it('keeps the v2 dealer hole card hidden', () => {
    const dealer = parseDealerCards(hiddenHole, BLACKJACK_V2_MATH_VERSION);
    assert.equal(dealer[0]?.isHidden, false);
    assert.equal(dealer[1]?.isHidden, true);
  });

  it('shows the v3 dealer hole card face-up even when the server flags it hidden', () => {
    const dealer = parseDealerCards(hiddenHole, BLACKJACK_V3_MATH_VERSION);
    assert.equal(dealer[0]?.isHidden, false);
    assert.equal(dealer[1]?.isHidden, false);
  });

  it('shows the v4 dealer hole card face-up even when the server flags it hidden', () => {
    const dealer = parseDealerCards(hiddenHole, BLACKJACK_V4_MATH_VERSION);
    assert.equal(dealer[0]?.isHidden, false);
    assert.equal(dealer[1]?.isHidden, false);
  });

  it('respects the server hide flag for unknown and null math versions', () => {
    const unknown = parseDealerCards(hiddenHole, 'blackjack-v9-unknown');
    const missing = parseDealerCards(hiddenHole, null);
    assert.equal(unknown[1]?.isHidden, true);
    assert.equal(missing[1]?.isHidden, true);
  });

  it('does not hide player cards', () => {
    const player = parsePlayerCards(hiddenHole);
    assert.equal(player[0]?.isHidden, false);
    assert.equal(player[1]?.isHidden, true);
  });

  it('pays v2 ×1.84 after catalog has moved on', () => {
    assert.equal(blackjackPayoutForVersion(10, 'win', BLACKJACK_V2_MATH_VERSION), 18.4);
    assert.equal(blackjackPayoutForVersion(10, 'golden', BLACKJACK_V2_MATH_VERSION), 20);
    assert.equal(blackjackPayoutForVersion(10, 'push', BLACKJACK_V2_MATH_VERSION), 10);
    assert.equal(blackjackPayoutForVersion(10, 'lose', BLACKJACK_V2_MATH_VERSION), 0);
  });

  it('pays v3 ×1.70 with the same golden and push table', () => {
    assert.equal(blackjackPayoutForVersion(10, 'win', BLACKJACK_V3_MATH_VERSION), 17);
    assert.equal(blackjackPayoutForVersion(10, 'golden', BLACKJACK_V3_MATH_VERSION), 20);
    assert.equal(blackjackPayoutForVersion(10, 'push', BLACKJACK_V3_MATH_VERSION), 10);
    assert.equal(blackjackPayoutForVersion(10, 'lose', BLACKJACK_V3_MATH_VERSION), 0);
  });

  it('pays v4 ×2.00 with golden ×2.00 and push ×1.00', () => {
    assert.equal(blackjackPayoutForVersion(10, 'win', BLACKJACK_V4_MATH_VERSION), 20);
    assert.equal(blackjackPayoutForVersion(10, 'golden', BLACKJACK_V4_MATH_VERSION), 20);
    assert.equal(blackjackPayoutForVersion(10, 'push', BLACKJACK_V4_MATH_VERSION), 10);
    assert.equal(blackjackPayoutForVersion(10, 'lose', BLACKJACK_V4_MATH_VERSION), 0);
  });

  it('does not silently use a catalog payout for unknown or null versions', () => {
    assert.throws(
      () => blackjackPayoutForVersion(10, 'win', 'blackjack-v9-unknown'),
      (error: unknown) => error instanceof BlackjackMathVersionError && error.code === 'BLACKJACK_MATH_VERSION_UNSUPPORTED',
    );
    assert.throws(
      () => blackjackPayoutForVersion(10, 'win', null),
      (error: unknown) => error instanceof BlackjackMathVersionError && error.code === 'BLACKJACK_MATH_VERSION_MISSING',
    );
  });
});
