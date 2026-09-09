import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BetSelection } from '../types';
import { acceptLsportsSelection, acceptSportsSelection } from './sportsOddGuard';

function selection(init: Partial<BetSelection> & Pick<BetSelection, 'provider' | 'outcomeId'>): BetSelection {
  return {
    id: `${init.provider}:${init.outcomeId}`,
    matchId: init.matchId ?? init.fixtureId ?? 'fx-1',
    matchLabel: 'Home — Away',
    market: 'Winner',
    outcome: 'Home',
    odds: 1.9,
    feedType: 'inplay',
    fixtureId: init.fixtureId ?? 'fx-1',
    marketId: 'm1',
    marketKey: `${init.fixtureId ?? 'fx-1'}:m1:`,
    line: '',
    ...init,
  };
}

describe('sports selection acceptance', () => {
  it('accepts a generic provider with opaque non-numeric outcomeId', () => {
    const row = selection({ provider: 'provider-b', outcomeId: 'opaque-id', fixtureId: 'fx-b' });
    assert.equal(acceptSportsSelection(row)?.provider, 'provider-b');
    assert.equal(acceptSportsSelection(row)?.outcomeId, 'opaque-id');
    assert.equal(acceptLsportsSelection(row), null);
  });

  it('rejects missing, blank, and whitespace providers', () => {
    const base = selection({ provider: 'provider-a', outcomeId: 'out-1' });
    assert.equal(acceptSportsSelection({ ...base, provider: undefined }), null);
    assert.equal(acceptSportsSelection({ ...base, provider: '' }), null);
    assert.equal(acceptSportsSelection({ ...base, provider: '   ' }), null);
  });

  it('does not accept provider-b through the LSports-specific helper', () => {
    const row = selection({
      provider: 'provider-b',
      fixtureId: '19981248',
      marketId: '1',
      marketKey: '19981248:1:',
      outcomeId: '117469638719981250',
    });
    assert.equal(acceptLsportsSelection(row), null);
    assert.equal(acceptSportsSelection(row)?.provider, 'provider-b');
  });
});
