import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mainOutcomeButtons } from './cardOdds';
import {
  isFakeDefault1x2,
  isLsportsDisplayEvent,
  lsportsCardMarkets,
} from './lsportsFeed';
import type { MatchEvent } from '../types';

function match(partial: Partial<MatchEvent> & Pick<MatchEvent, 'markets' | 'marketsLocked'>): MatchEvent {
  return {
    id: '19981248',
    sport: 'football',
    league: 'Premier League',
    country: 'England',
    team1: 'Home FC',
    team2: 'Away FC',
    team1Color: '#000',
    team2Color: '#fff',
    startTime: 0,
    isLive: true,
    extraMarkets: 0,
    ...partial,
  };
}

describe('lsports display feed guards', () => {
  it('tags LSports events and never uses default 1X2 when prices are missing', () => {
    assert.equal(isLsportsDisplayEvent({ our_events: 'lsports' }), true);
    assert.equal(isLsportsDisplayEvent({ our_events: undefined }), false);
    const locked = lsportsCardMarkets({ '1': 0, x: 0, '2': 0 });
    assert.equal(isFakeDefault1x2(locked.markets), false);
    assert.equal(locked.marketsLocked, true);
    const buttons = mainOutcomeButtons(match({ markets: locked.markets, marketsLocked: true }));
    assert.deepEqual(buttons.map((row) => row.odds), [0, 0, 0]);
    assert.ok(buttons.every((row) => row.locked));
  });

  it('keeps BetsAPI fallbacks when the match is not LSports-locked', () => {
    const buttons = mainOutcomeButtons(match({
      markets: { '1': 0, x: 0, '2': 0 },
      marketsLocked: false,
    }));
    assert.deepEqual(buttons.map((row) => row.odds), [2.1, 3.25, 2.8]);
    assert.ok(buttons.every((row) => !row.locked));
  });
});
