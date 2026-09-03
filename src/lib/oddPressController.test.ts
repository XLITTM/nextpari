import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOddPressController, ODD_LONG_PRESS_MS } from './oddPressController';
import { addSlipSelection } from './sportsPlaceSlip';
import { serializeSportsPlaceBody } from './sportsPlaceRequest';
import type { BetSelection } from '../types';

const CANONICAL: BetSelection = {
  id: 'lsports:19981248:19981248:1::117469638719981250',
  matchId: '19981248',
  matchLabel: 'Toulouse — Lille',
  market: '1X2',
  outcome: 'П1',
  odds: 2.45,
  provider: 'lsports',
  feedType: 'inplay',
  fixtureId: '19981248',
  marketId: '1',
  marketKey: '19981248:1:',
  line: '',
  outcomeId: '117469638719981250',
};

const INCOMPLETE: BetSelection = {
  id: '19990001-1X2-П1',
  matchId: '19990001',
  matchLabel: 'Cagliari — Hellas Verona',
  market: '1X2',
  outcome: 'П1',
  odds: 2.1,
  provider: 'lsports',
  fixtureId: '19990001',
};

function runPress(selection: BetSelection, events: Array<Parameters<ReturnType<typeof createOddPressController>['handle']>[0]>) {
  const quick: BetSelection[] = [];
  const coupon: BetSelection[] = [];
  const controller = createOddPressController({
    selection,
    now: () => 0,
    longPressMs: ODD_LONG_PRESS_MS,
    onQuickBet: (next) => quick.push(next),
    onCoupon: (next) => coupon.push(next),
  });
  const actions = events.map((event) => controller.handle(event));
  controller.dispose();
  return { quick, coupon, actions };
}

describe('odd press interaction', () => {
  it('short tap of a canonical 1X2 opens Quick Bet and does not add to coupon', () => {
    const result = runPress(CANONICAL, [
      { type: 'down', now: 0, x: 0, y: 0 },
      { type: 'up', now: 120, x: 0, y: 0 },
      { type: 'click' },
    ]);
    assert.equal(result.quick.length, 1);
    assert.equal(result.coupon.length, 0);
    assert.equal(result.quick[0]?.outcomeId, CANONICAL.outcomeId);
    assert.deepEqual(result.actions, ['none', 'quickBet', 'none']);
  });

  it('long hold of the same outcome adds to coupon and does not open Quick Bet', () => {
    const result = runPress(CANONICAL, [
      { type: 'down', now: 0, x: 0, y: 0 },
      { type: 'up', now: ODD_LONG_PRESS_MS, x: 0, y: 0 },
      { type: 'click' },
    ]);
    assert.equal(result.coupon.length, 1);
    assert.equal(result.quick.length, 0);
    assert.equal(result.coupon[0]?.outcomeId, CANONICAL.outcomeId);
    assert.equal(result.actions[1], 'coupon');
    assert.equal(result.actions[2], 'none');
  });

  it('click emitted after a long hold does not also open Quick Bet', () => {
    const result = runPress(CANONICAL, [
      { type: 'down', now: 0, x: 0, y: 0 },
      { type: 'up', now: 600, x: 1, y: 1 },
      { type: 'click' },
      { type: 'click' },
    ]);
    assert.equal(result.coupon.length, 1);
    assert.equal(result.quick.length, 0);
  });

  it('cancels a hold when the pointer moves away', () => {
    const result = runPress(CANONICAL, [
      { type: 'down', now: 0, x: 0, y: 0 },
      { type: 'move', now: 80, x: 20, y: 0 },
      { type: 'up', now: 100, x: 20, y: 0 },
      { type: 'click' },
    ]);
    assert.equal(result.quick.length, 0);
    assert.equal(result.coupon.length, 0);
  });

  it('rejects an LSports 1X2 without providerBetId before coupon or quick bet', () => {
    const result = runPress(INCOMPLETE, [
      { type: 'down', now: 0, x: 0, y: 0 },
      { type: 'up', now: 80, x: 0, y: 0 },
      { type: 'click' },
    ]);
    assert.equal(result.quick.length, 0);
    assert.equal(result.coupon.length, 0);
    assert.deepEqual(addSlipSelection([], INCOMPLETE), []);
    assert.equal(serializeSportsPlaceBody({
      selections: [INCOMPLETE],
      stake: 10,
      idempotencyKey: 'k',
    }), null);
  });
});
