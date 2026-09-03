import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ParsedMarket } from './odds-parser';
import {
  assertLsportsPlaceLeg,
  serializeSportsPlaceBody,
  serializeSportsPlaceLeg,
} from './sportsPlaceRequest';
import { placeModeFromCount, placeModeLabel } from './sportsPlaceMode';
import { addSlipSelection, removeSlipSelection, slipPlaceMode } from './sportsPlaceSlip';
import { hasCompleteLsportsIdentity, selectionFromLsportsOutcome } from './sportsPlaceIdentity';
import type { BetSelection, MatchEvent } from '../types';

const FIXTURE = '19981248';
const HOME_BET = '117469638719981250';
const DRAW_BET = '212242794219981250';
const OVER_25 = '46928646919981250';
const AH_HOME = '330000000000000001';
const BTTS_YES = '1701555019981250';

const MATCH: MatchEvent = {
  id: FIXTURE,
  sport: 'football',
  league: 'Premier League',
  country: 'England',
  team1: 'Home FC',
  team2: 'Away FC',
  team1Color: '#000',
  team2Color: '#fff',
  startTime: 0,
  isLive: true,
  extraMarkets: 4,
  markets: { '1': 1.85, x: 3.4, '2': 4.2 },
  feedTag: 'lsports',
};

function market1x2(): ParsedMarket {
  return {
    key: '1_1',
    bookmaker: '1',
    marketId: '1',
    name: '1X2',
    category: 'main',
    canonicalKey: `${FIXTURE}:1:`,
    entries: [{
      id: `lsports-${FIXTURE}-1-main`,
      canonicalKey: `${FIXTURE}:1:`,
      updatedAt: 1,
      outcomes: [
        { key: 'home', odds: 1.85, raw: '1.85', providerBetId: HOME_BET },
        { key: 'draw', odds: 3.4, raw: '3.40', providerBetId: DRAW_BET },
        { key: 'away', odds: 4.2, raw: '4.20', providerBetId: '155418696819981250' },
      ],
    }],
  };
}

function marketTotals(): ParsedMarket {
  return {
    key: 'lsports:2',
    bookmaker: '1',
    marketId: '2',
    name: 'Under/Over',
    category: 'main',
    entries: [{
      id: `lsports-${FIXTURE}-2-2.5`,
      line: '2.5',
      canonicalKey: `${FIXTURE}:2:2.5`,
      updatedAt: 1,
      outcomes: [
        { key: 'over', odds: 2.14, raw: '2.14', providerBetId: OVER_25 },
        { key: 'under', odds: 1.72, raw: '1.72', providerBetId: '46928647019981250' },
      ],
    }],
  };
}

function marketHandicap(): ParsedMarket {
  return {
    key: 'lsports:1439',
    bookmaker: '1',
    marketId: '1439',
    name: 'Asian Handicap',
    category: 'main',
    entries: [{
      id: `lsports-${FIXTURE}-1439--1.0`,
      line: '-1.0',
      canonicalKey: `${FIXTURE}:1439:-1.0`,
      updatedAt: 1,
      outcomes: [
        { key: 'home', odds: 1.97, raw: '1.97', providerBetId: AH_HOME },
        { key: 'away', odds: 1.80, raw: '1.80', providerBetId: '330000000000000002' },
      ],
    }],
  };
}

function marketBtts(): ParsedMarket {
  return {
    key: 'lsports:17',
    bookmaker: '1',
    marketId: '17',
    name: 'Both Teams To Score',
    category: 'specials',
    entries: [{
      id: `lsports-${FIXTURE}-17-main`,
      canonicalKey: `${FIXTURE}:17:`,
      updatedAt: 1,
      outcomes: [
        { key: 'yes', odds: 1.88, raw: '1.88', providerBetId: BTTS_YES },
        { key: 'no', odds: 1.90, raw: '1.90', providerBetId: '1701555119981250' },
      ],
    }],
  };
}

function mustSelect(market: ParsedMarket, outcomeKey: string): BetSelection {
  const entry = market.entries[0];
  const outcome = entry?.outcomes.find((row) => row.key === outcomeKey);
  assert.ok(entry && outcome);
  const selection = selectionFromLsportsOutcome(MATCH, market, entry, outcome);
  assert.ok(selection);
  return selection;
}

describe('betslip place mode', () => {
  it('uses single for 1 leg and express for 2+ legs, including after a removal', () => {
    assert.equal(placeModeFromCount(1), 'single');
    assert.equal(placeModeLabel('single'), 'Ординар');
    assert.equal(placeModeFromCount(2), 'express');
    assert.equal(placeModeLabel('express'), 'Экспресс');

    const one = mustSelect(market1x2(), 'home');
    const two = mustSelect(marketTotals(), 'over');
    two.matchId = '19999999';
    two.fixtureId = '19999999';
    two.marketKey = '19999999:2:2.5';
    two.id = `lsports:19999999:${two.marketKey}:${two.outcomeId}`;

    let slip = addSlipSelection([], one);
    assert.equal(slipPlaceMode(slip), 'single');
    assert.equal(serializeSportsPlaceBody({ selections: slip, stake: 10, idempotencyKey: 'k' })?.mode, 'single');

    slip = addSlipSelection(slip, two);
    assert.equal(slip.length, 2);
    assert.equal(slipPlaceMode(slip), 'express');
    assert.equal(serializeSportsPlaceBody({ selections: slip, stake: 10, idempotencyKey: 'k' })?.mode, 'express');

    slip = removeSlipSelection(slip, two.matchId, two.outcome);
    assert.equal(slip.length, 1);
    assert.equal(slipPlaceMode(slip), 'single');
    assert.equal(slip[0]?.outcomeId, HOME_BET);
    assert.equal(serializeSportsPlaceBody({ selections: slip, stake: 10, idempotencyKey: 'k' })?.mode, 'single');
  });
});

describe('real LSports place identity', () => {
  it('preserves providerBetId as outcomeId for 1X2, totals, handicap, and BTTS', () => {
    const oneX2 = serializeSportsPlaceLeg(mustSelect(market1x2(), 'home'));
    const totals = serializeSportsPlaceLeg(mustSelect(marketTotals(), 'over'));
    const handicap = serializeSportsPlaceLeg(mustSelect(marketHandicap(), 'home'));
    const btts = serializeSportsPlaceLeg(mustSelect(marketBtts(), 'yes'));

    assert.deepEqual(oneX2, {
      provider: 'lsports',
      feedType: 'inplay',
      fixtureId: FIXTURE,
      marketId: '1',
      marketKey: `${FIXTURE}:1:`,
      line: '',
      outcomeId: HOME_BET,
      price: 1.85,
      matchLabel: 'Home FC — Away FC',
      league: 'Premier League',
      outcomeName: 'П1',
    });
    assert.equal(totals.outcomeId, OVER_25);
    assert.equal(totals.marketId, '2');
    assert.equal(totals.marketKey, `${FIXTURE}:2:2.5`);
    assert.equal(totals.line, '2.5');
    assert.equal(handicap.outcomeId, AH_HOME);
    assert.equal(handicap.marketKey, `${FIXTURE}:1439:-1.0`);
    assert.equal(handicap.line, '-1.0');
    assert.equal(btts.outcomeId, BTTS_YES);
    assert.equal(btts.marketKey, `${FIXTURE}:17:`);
    assert.equal(btts.line, '');
    for (const leg of [oneX2, totals, handicap, btts]) {
      assert.equal(assertLsportsPlaceLeg(leg), true);
      assert.equal(looksGenerated(leg.outcomeId), false);
    }
  });

  it('keeps providerBetId on the slip across add, add another, remove, and mode change', () => {
    const first = mustSelect(market1x2(), 'home');
    const second = mustSelect(marketBtts(), 'yes');
    second.matchId = '20000001';
    second.fixtureId = '20000001';
    second.marketKey = '20000001:17:';
    second.id = `lsports:20000001:20000001:17:${BTTS_YES}`;

    let slip = addSlipSelection([], first);
    assert.equal(slip[0]?.outcomeId, HOME_BET);
    slip = addSlipSelection(slip, second);
    assert.equal(slipPlaceMode(slip), 'express');
    assert.equal(slip.find((row) => row.outcomeId === HOME_BET)?.outcomeId, HOME_BET);
    assert.equal(slip.find((row) => row.outcomeId === BTTS_YES)?.outcomeId, BTTS_YES);
    slip = removeSlipSelection(slip, second.matchId, second.outcome);
    assert.equal(slipPlaceMode(slip), 'single');
    assert.equal(slip[0]?.outcomeId, HOME_BET);
    assert.equal(slip[0]?.marketKey, `${FIXTURE}:1:`);
    assert.equal(hasCompleteLsportsIdentity(slip[0]!), true);
  });

  it('does not invent Bet.Id or a display-label marketKey', () => {
    const incomplete = serializeSportsPlaceLeg({
      id: `${FIXTURE}-Тотал-ТБ`,
      matchId: FIXTURE,
      matchLabel: 'Home FC — Away FC',
      market: 'Тотал',
      outcome: 'over',
      odds: 2.1,
    });
    assert.equal(incomplete.outcomeId, '');
    assert.equal(incomplete.marketKey, '');
    assert.equal(assertLsportsPlaceLeg(incomplete), false);
    assert.notEqual(incomplete.outcomeId, 'over');
    assert.notEqual(incomplete.marketKey, 'total');
    assert.equal(serializeSportsPlaceBody({
      selections: [{
        id: `${FIXTURE}-Тотал-ТБ`,
        matchId: FIXTURE,
        matchLabel: 'Home FC — Away FC',
        market: 'Тотал',
        outcome: 'over',
        odds: 2.1,
      }],
      stake: 10,
      idempotencyKey: 'k',
    }), null);
  });
});

function looksGenerated(outcomeId: string): boolean {
  return /^(over|under|home|away|draw|yes|no|1x2)$/i.test(outcomeId);
}
