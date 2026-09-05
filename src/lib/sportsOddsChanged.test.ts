import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BetSelection } from '../types';
import { oddsUpdatesFromPlaceError } from './sportsOddsChanged';

function leg(partial: Partial<BetSelection> & Pick<BetSelection, 'id' | 'fixtureId' | 'outcomeId'>): BetSelection {
  return {
    matchId: partial.fixtureId ?? '1',
    matchLabel: partial.matchLabel ?? `Match ${partial.fixtureId ?? '1'}`,
    market: '1X2',
    outcome: partial.outcome ?? '1',
    odds: partial.odds ?? 1.5,
    marketId: '1',
    marketKey: `${partial.fixtureId ?? '1'}:1:`,
    line: '',
    ...partial,
  };
}

const EXPRESS: BetSelection[] = [
  leg({ id: 'leg-1', fixtureId: '100', outcomeId: 'o1', odds: 1.4, matchLabel: 'A — B', outcome: 'П1' }),
  leg({ id: 'leg-2', fixtureId: '200', outcomeId: 'o2', odds: 1.8, matchLabel: 'C — D', outcome: 'X' }),
  leg({ id: 'leg-3', fixtureId: '300', outcomeId: 'o3', odds: 2.1, matchLabel: 'E — F', outcome: 'П2' }),
];

describe('per-leg ODDS_CHANGED mapping', () => {
  it('updates only the exact express leg from sanitized changedLeg', () => {
    const updates = oddsUpdatesFromPlaceError({
      error: 'ODDS_CHANGED',
      currentPrice: 2.2,
      changedLeg: {
        fixtureId: '200',
        marketId: '1',
        marketKey: '200:1:',
        line: '',
        outcomeId: 'o2',
        currentPrice: 2.2,
      },
    }, EXPRESS);

    assert.equal(updates?.length, 1);
    assert.equal(updates?.[0]?.id, 'leg-2');
    assert.equal(updates?.[0]?.odds, 2.2);
    assert.equal(updates?.[0]?.previousOdds, 1.8);
    assert.equal(updates?.[0]?.matchLabel, 'C — D');
    assert.equal(EXPRESS[0]?.odds, 1.4);
    assert.equal(EXPRESS[2]?.odds, 2.1);
  });

  it('never copies one currentPrice onto every express selection', () => {
    const updates = oddsUpdatesFromPlaceError({
      error: 'ODDS_CHANGED',
      currentPrice: 2.2,
    }, EXPRESS);

    assert.equal(updates, undefined);
  });

  it('can still apply currentPrice to a single-leg coupon', () => {
    const updates = oddsUpdatesFromPlaceError({
      error: 'ODDS_CHANGED',
      currentPrice: 1.91,
    }, [EXPRESS[0]!]);

    assert.equal(updates?.length, 1);
    assert.equal(updates?.[0]?.id, 'leg-1');
    assert.equal(updates?.[0]?.odds, 1.91);
  });
});
