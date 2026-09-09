import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOddPressController, ODD_LONG_PRESS_MS } from './oddPressController';
import { addSlipSelection } from './sportsPlaceSlip';
import { serializeSportsPlaceBody } from './sportsPlaceRequest';
import { acceptSportsSelection } from './sportsOddGuard';
import { canInteractWithOdd } from '../hooks/useOddInteraction';
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

function genericSelection(provider: string, fixtureId: string, outcomeId: string): BetSelection {
  return {
    id: `${provider}:${fixtureId}:${outcomeId}`,
    matchId: fixtureId,
    matchLabel: 'Home FC — Away FC',
    market: 'Winner',
    outcome: 'Home',
    odds: 1.9,
    provider,
    feedType: 'inplay',
    fixtureId,
    marketId: 'm1',
    marketKey: `${fixtureId}:m1:`,
    line: '',
    outcomeId,
  };
}

describe('provider-neutral odd press and Quick Bet path', () => {
  it('short press Quick Bet and long press coupon preserve provider-a', () => {
    const selection = genericSelection('provider-a', 'fx-a', 'out-a');
    const shortPress = runPress(selection, [
      { type: 'down', now: 0, x: 0, y: 0 },
      { type: 'up', now: 120, x: 0, y: 0 },
    ]);
    assert.equal(shortPress.quick.length, 1);
    assert.equal(shortPress.coupon.length, 0);
    assert.equal(shortPress.quick[0]?.provider, 'provider-a');

    const longPress = runPress(selection, [
      { type: 'down', now: 0, x: 0, y: 0 },
      { type: 'up', now: ODD_LONG_PRESS_MS, x: 0, y: 0 },
    ]);
    assert.equal(longPress.coupon.length, 1);
    assert.equal(longPress.quick.length, 0);
    assert.equal(longPress.coupon[0]?.provider, 'provider-a');
  });

  it('canInteractWithOdd is true for generic identity and false without provider', () => {
    const selection = genericSelection('provider-a', 'fx-a', 'out-a');
    assert.equal(canInteractWithOdd(selection), true);
    assert.equal(canInteractWithOdd({ ...selection, provider: undefined }), false);
    assert.equal(canInteractWithOdd({ ...selection, provider: '' }), false);
  });

  it('preserves provider-b through Quick Bet acceptance and place serialization', () => {
    const selection = genericSelection('provider-b', 'fx-b', 'opaque-id');
    const accepted = acceptSportsSelection(selection);
    assert.equal(accepted?.provider, 'provider-b');
    const shortPress = runPress(selection, [
      { type: 'down', now: 0, x: 0, y: 0 },
      { type: 'up', now: 80, x: 0, y: 0 },
    ]);
    assert.equal(shortPress.quick[0]?.provider, 'provider-b');
    const body = serializeSportsPlaceBody({
      selections: [shortPress.quick[0]!],
      stake: 10,
      idempotencyKey: 'k-quick-b',
    });
    assert.equal(body?.selections[0]?.provider, 'provider-b');
    assert.equal(body?.selections[0]?.outcomeId, 'opaque-id');
  });

  it('lets an opaque non-numeric outcomeId survive odd interaction, coupon, and serialize', () => {
    const selection = genericSelection('provider-b', 'fx-b', 'opaque-leg');
    const longPress = runPress(selection, [
      { type: 'down', now: 0, x: 0, y: 0 },
      { type: 'up', now: ODD_LONG_PRESS_MS, x: 0, y: 0 },
    ]);
    assert.equal(longPress.coupon[0]?.outcomeId, 'opaque-leg');
    const slip = addSlipSelection([], longPress.coupon[0]!);
    assert.equal(slip[0]?.outcomeId, 'opaque-leg');
    const body = serializeSportsPlaceBody({
      selections: slip,
      stake: 10,
      idempotencyKey: 'k-opaque-path',
    });
    assert.equal(body?.selections[0]?.provider, 'provider-b');
    assert.equal(body?.selections[0]?.outcomeId, 'opaque-leg');
  });

  it('still accepts a real LSports selection and rejects a fake LSports outcomeId', () => {
    const real = runPress(CANONICAL, [
      { type: 'down', now: 0, x: 0, y: 0 },
      { type: 'up', now: 80, x: 0, y: 0 },
    ]);
    assert.equal(real.quick[0]?.provider, 'lsports');
    assert.equal(real.quick[0]?.outcomeId, CANONICAL.outcomeId);
    assert.equal(canInteractWithOdd(CANONICAL), true);

    const fake = { ...CANONICAL, outcomeId: 'over' };
    assert.equal(canInteractWithOdd(fake), false);
    const blocked = runPress(fake, [
      { type: 'down', now: 0, x: 0, y: 0 },
      { type: 'up', now: 80, x: 0, y: 0 },
    ]);
    assert.equal(blocked.quick.length, 0);
    assert.equal(blocked.actions[0], 'blocked');
  });

  it('does not call acceptLsportsSelection from generic active client paths', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const files = [
      'lib/oddPressController.ts',
      'hooks/useOddInteraction.ts',
      'QuickBetContext.tsx',
      'components/QuickBetSheet.tsx',
      'lib/sportsPlaceSlip.ts',
      'lib/sportsPlaceRequest.ts',
    ];
    for (const rel of files) {
      const src = readFileSync(join(root, rel), 'utf8');
      assert.equal(src.includes('acceptLsportsSelection'), false, rel);
    }
  });
});
