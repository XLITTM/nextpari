import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ParsedMarket } from './odds-parser';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertLsportsPlaceLeg,
  assertSportsPlaceLeg,
  serializeSportsPlaceBody,
  serializeSportsPlaceLeg,
} from './sportsPlaceRequest';
import { placeModeFromCount, placeModeLabel } from './sportsPlaceMode';
import { addSlipSelection, removeSlipSelection, slipPlaceMode } from './sportsPlaceSlip';
import { acceptLsportsSelection, acceptSportsSelection } from './sportsOddGuard';
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

function genericSelection(provider: string, fixtureId: string, outcomeId = 'out-1'): BetSelection {
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

describe('provider-neutral place serialization', () => {
  it('preserves an arbitrary provider without rewriting it to lsports', () => {
    const body = serializeSportsPlaceBody({
      selections: [genericSelection('  provider-b  ', 'fx-b')],
      stake: 10,
      idempotencyKey: 'k-provider-b',
    });
    assert.equal(body?.selections[0]?.provider, 'provider-b');
    assert.notEqual(body?.selections[0]?.provider, 'lsports');
  });

  it('preserves an explicit betsapi provider string without claiming it is placeable', () => {
    const body = serializeSportsPlaceBody({
      selections: [genericSelection('betsapi', 'fx-betsapi', 'bet-1')],
      stake: 10,
      idempotencyKey: 'k-betsapi',
    });
    assert.equal(body?.selections[0]?.provider, 'betsapi');
    assert.equal(assertSportsPlaceLeg(body!.selections[0]!), true);
    assert.equal(assertLsportsPlaceLeg(body!.selections[0]!), false);
  });

  it('fails closed when provider is missing, blank, or whitespace', () => {
    const base = genericSelection('provider-b', 'fx-1');
    for (const provider of [undefined, '', '   '] as const) {
      assert.equal(serializeSportsPlaceBody({
        selections: [{ ...base, provider }],
        stake: 10,
        idempotencyKey: 'k-missing',
      }), null);
    }
  });

  it('preserves mixed-provider express per leg', () => {
    const body = serializeSportsPlaceBody({
      selections: [
        genericSelection('provider-a', 'fx-a', 'out-a'),
        genericSelection('provider-b', 'fx-b', 'out-b'),
      ],
      stake: 20,
      idempotencyKey: 'k-mixed',
    });
    assert.equal(body?.mode, 'express');
    assert.equal(body?.selections[0]?.provider, 'provider-a');
    assert.equal(body?.selections[1]?.provider, 'provider-b');
  });

  it('does not apply LSports Bet.Id rules to an unknown explicit provider', () => {
    const selection = genericSelection('provider-b', 'fx-1', 'over');
    selection.marketKey = 'total';
    const body = serializeSportsPlaceBody({
      selections: [selection],
      stake: 10,
      idempotencyKey: 'k-unknown',
    });
    assert.equal(body?.selections[0]?.provider, 'provider-b');
    assert.equal(body?.selections[0]?.outcomeId, 'over');
    assert.equal(body?.selections[0]?.marketKey, 'total');
    assert.equal(assertSportsPlaceLeg(body!.selections[0]!), true);
    assert.equal(assertLsportsPlaceLeg(body!.selections[0]!), false);
  });

  it('keeps LSports identity strict for fake Bet.Id and display-label marketKey', () => {
    const fakeId = serializeSportsPlaceBody({
      selections: [{
        ...mustSelect(market1x2(), 'home'),
        outcomeId: 'over',
      }],
      stake: 10,
      idempotencyKey: 'k-fake-id',
    });
    assert.equal(fakeId, null);

    const labelKey = serializeSportsPlaceBody({
      selections: [{
        ...mustSelect(market1x2(), 'home'),
        marketKey: '1X2',
      }],
      stake: 10,
      idempotencyKey: 'k-label-key',
    });
    assert.equal(labelKey, null);
  });

  it('does not hardcode provider: lsports in the generic serializer source', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'sportsPlaceRequest.ts'), 'utf8');
    assert.equal(/provider:\s*'lsports'/.test(src), false);
    assert.equal(/provider\s*\?\?/.test(src), false);
    assert.equal(/provider\s*\|\|/.test(src), false);
  });
});

describe('provider-neutral betslip intake', () => {
  it('accepts a complete provider-a selection without rewriting provider', () => {
    const selection = genericSelection('provider-a', 'fx-a', 'out-a');
    const slip = addSlipSelection([], selection);
    assert.equal(slip.length, 1);
    assert.equal(slip[0]?.provider, 'provider-a');
    assert.equal(acceptSportsSelection(selection)?.provider, 'provider-a');
  });

  it('keeps mixed-provider express through addSlipSelection and serializeSportsPlaceBody', () => {
    const providerA = genericSelection('provider-a', 'fx-a', 'out-a');
    const providerB = genericSelection('provider-b', 'fx-b', 'opaque-id');
    let slip = addSlipSelection([], providerA);
    slip = addSlipSelection(slip, providerB);
    assert.equal(slip.length, 2);
    assert.equal(slip[0]?.provider, 'provider-a');
    assert.equal(slip[1]?.provider, 'provider-b');
    const body = serializeSportsPlaceBody({ selections: slip, stake: 20, idempotencyKey: 'k-slip-mixed' });
    assert.equal(body?.mode, 'express');
    assert.equal(body?.selections[0]?.provider, 'provider-a');
    assert.equal(body?.selections[1]?.provider, 'provider-b');
  });

  it('rejects missing and blank providers at slip intake', () => {
    const base = genericSelection('provider-a', 'fx-a');
    assert.deepEqual(addSlipSelection([], { ...base, provider: undefined }), []);
    assert.deepEqual(addSlipSelection([], { ...base, provider: '' }), []);
    assert.deepEqual(addSlipSelection([], { ...base, provider: '   ' }), []);
  });

  it('accepts a real LSports selection and rejects a fake LSports outcomeId', () => {
    const real = mustSelect(market1x2(), 'home');
    const accepted = addSlipSelection([], real);
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0]?.provider, 'lsports');
    assert.equal(accepted[0]?.outcomeId, HOME_BET);
    assert.deepEqual(addSlipSelection([], { ...real, outcomeId: 'over' }), []);
  });

  it('accepts provider-b with a non-numeric opaque outcomeId and does not use LSports Bet.Id rules', () => {
    const selection = genericSelection('provider-b', 'fx-b', 'opaque-leg');
    const slip = addSlipSelection([], selection);
    assert.equal(slip.length, 1);
    assert.equal(slip[0]?.outcomeId, 'opaque-leg');
    assert.equal(acceptLsportsSelection(selection), null);
    assert.equal(acceptSportsSelection(selection)?.outcomeId, 'opaque-leg');
  });

  it('does not let acceptLsportsSelection accept a non-lsports provider', () => {
    const numericLookalike = genericSelection('provider-b', FIXTURE, HOME_BET);
    numericLookalike.marketId = '1';
    numericLookalike.marketKey = `${FIXTURE}:1:`;
    numericLookalike.line = '';
    assert.equal(acceptLsportsSelection(numericLookalike), null);
    assert.equal(addSlipSelection([], numericLookalike).length, 1);
    assert.equal(addSlipSelection([], numericLookalike)[0]?.provider, 'provider-b');
  });

  it('still keeps one selection per match', () => {
    const first = genericSelection('provider-a', 'fx-same', 'out-1');
    const second = genericSelection('provider-b', 'fx-same', 'out-2');
    second.matchId = 'fx-same';
    second.id = 'provider-b:fx-same:out-2';
    const slip = addSlipSelection(addSlipSelection([], first), second);
    assert.equal(slip.length, 1);
    assert.equal(slip[0]?.provider, 'provider-b');
    assert.equal(slip[0]?.outcomeId, 'out-2');
  });

  it('does not use LSports-only acceptance in the generic slip source', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'sportsPlaceSlip.ts'), 'utf8');
    assert.equal(src.includes('acceptLsportsSelection'), false);
    assert.equal(src.includes('hasCompleteLsportsIdentity'), false);
    assert.equal(/provider:\s*'lsports'/.test(src), false);
  });
});
