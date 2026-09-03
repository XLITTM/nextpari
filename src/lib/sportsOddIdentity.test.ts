import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ParsedMarket } from './odds-parser';
import { acceptLsportsSelection } from './sportsOddGuard';
import {
  clickableCardSelectionFromMarkets,
  lsportsCardSelectionFromMarkets,
} from './sportsCardIdentity';
import { addSlipSelection } from './sportsPlaceSlip';
import { serializeSportsPlaceBody } from './sportsPlaceRequest';
import { hasCompleteLsportsIdentity, selectionFromLsportsOutcome } from './sportsPlaceIdentity';
import type { BetSelection, MatchEvent } from '../types';

const TOULOUSE_HOME = '117469638719981248';
const CAGLIARI_ID = '19990001';
const OVER_25 = '46928646919981248';
const AH_HOME = '330000000000000001';
const BTTS_YES = '1701555019981248';
const VERONA_HOME = '155418696819990001';

function match(id: string, team1: string, team2: string): MatchEvent {
  return {
    id,
    sport: 'football',
    league: 'Serie A',
    country: 'Italy',
    team1,
    team2,
    team1Color: '#000',
    team2Color: '#fff',
    startTime: 0,
    isLive: true,
    extraMarkets: 4,
    markets: { '1': 2.1, x: 3.2, '2': 3.4 },
    feedTag: 'lsports',
  };
}

function market1x2(fixtureId: string, homeBet: string): ParsedMarket {
  return {
    key: '1_1',
    bookmaker: '1',
    marketId: '1',
    name: '1X2',
    category: 'main',
    canonicalKey: `${fixtureId}:1:`,
    entries: [{
      id: `lsports-${fixtureId}-1-main`,
      canonicalKey: `${fixtureId}:1:`,
      updatedAt: 1,
      outcomes: [
        { key: 'home', odds: 2.45, raw: '2.45', providerBetId: homeBet },
        { key: 'draw', odds: 3.2, raw: '3.20', providerBetId: `${homeBet}2` },
        { key: 'away', odds: 3.1, raw: '3.10', providerBetId: `${homeBet}3` },
      ],
    }],
  };
}

function marketWithoutBetId(fixtureId: string): ParsedMarket {
  return {
    key: '1_1',
    bookmaker: '1',
    marketId: '1',
    name: '1X2',
    category: 'main',
    canonicalKey: `${fixtureId}:1:`,
    entries: [{
      id: `lsports-${fixtureId}-1-main`,
      canonicalKey: `${fixtureId}:1:`,
      updatedAt: 1,
      outcomes: [
        { key: 'home', odds: 2.1, raw: '2.10' },
        { key: 'draw', odds: 3.2, raw: '3.20' },
        { key: 'away', odds: 3.4, raw: '3.40' },
      ],
    }],
  };
}

function marketTotals(fixtureId: string): ParsedMarket {
  return {
    key: 'lsports:2',
    bookmaker: '1',
    marketId: '2',
    name: 'Under/Over',
    category: 'main',
    entries: [{
      id: `lsports-${fixtureId}-2-2.5`,
      line: '2.5',
      canonicalKey: `${fixtureId}:2:2.5`,
      updatedAt: 1,
      outcomes: [
        { key: 'over', odds: 2.14, raw: '2.14', providerBetId: OVER_25 },
        { key: 'under', odds: 1.72, raw: '1.72', providerBetId: '46928647019981248' },
      ],
    }],
  };
}

function marketHandicap(fixtureId: string): ParsedMarket {
  return {
    key: 'lsports:1439',
    bookmaker: '1',
    marketId: '1439',
    name: 'Asian Handicap',
    category: 'main',
    entries: [{
      id: `lsports-${fixtureId}-1439--1.0`,
      line: '-1.0',
      canonicalKey: `${fixtureId}:1439:-1.0`,
      updatedAt: 1,
      outcomes: [
        { key: 'home', odds: 1.97, raw: '1.97', providerBetId: AH_HOME },
        { key: 'away', odds: 1.80, raw: '1.80', providerBetId: '330000000000000002' },
      ],
    }],
  };
}

function marketBtts(fixtureId: string): ParsedMarket {
  return {
    key: 'lsports:17',
    bookmaker: '1',
    marketId: '17',
    name: 'Both Teams To Score',
    category: 'specials',
    entries: [{
      id: `lsports-${fixtureId}-17-main`,
      canonicalKey: `${fixtureId}:17:`,
      updatedAt: 1,
      outcomes: [
        { key: 'yes', odds: 1.88, raw: '1.88', providerBetId: BTTS_YES },
        { key: 'no', odds: 1.90, raw: '1.90', providerBetId: '1701555119981248' },
      ],
    }],
  };
}

function mustSelect(row: MatchEvent, market: ParsedMarket, key: string): BetSelection {
  const entry = market.entries[0];
  const outcome = entry?.outcomes.find((item) => item.key === key);
  assert.ok(entry && outcome);
  const selection = selectionFromLsportsOutcome(row, market, entry, outcome);
  assert.ok(selection);
  return selection;
}

function assertNoEmptyOutcomeId(body: ReturnType<typeof serializeSportsPlaceBody>) {
  assert.ok(body);
  for (const leg of body.selections) {
    assert.notEqual(leg.outcomeId, '');
    assert.notEqual(leg.outcomeId, undefined);
    assert.match(leg.outcomeId, /^\d{6,}$/);
  }
}

describe('LSports card identity', () => {
  it('Toulouse/Lille-style canonical 1X2 contains outcomeId', () => {
    const toulouse = match('19981248', 'Toulouse', 'Lille');
    toulouse.league = 'Ligue 1';
    toulouse.country = 'France';
    const clickable = clickableCardSelectionFromMarkets(
      toulouse,
      [market1x2(toulouse.id, TOULOUSE_HOME)],
      'П1',
      '1X2',
      2.45,
    );
    assert.equal(clickable.locked, false);
    assert.equal(clickable.selection.outcomeId, TOULOUSE_HOME);
    assert.equal(hasCompleteLsportsIdentity(clickable.selection), true);
    assert.equal(acceptLsportsSelection(clickable.selection)?.outcomeId, TOULOUSE_HOME);
  });

  it('Cagliari/Hellas-Verona-style card path can never produce a clickable selection without outcomeId', () => {
    const cagliari = match(CAGLIARI_ID, 'Cagliari', 'Hellas Verona');
    const empty = clickableCardSelectionFromMarkets(cagliari, [], 'П1', '1X2', 2.1);
    assert.equal(empty.locked, true);
    assert.equal(empty.selection.outcomeId, undefined);
    assert.equal(acceptLsportsSelection(empty.selection), null);
    assert.deepEqual(addSlipSelection([], empty.selection), []);
    assert.equal(serializeSportsPlaceBody({
      selections: [empty.selection],
      stake: 10,
      idempotencyKey: 'missing',
    }), null);

    const unlabeled = clickableCardSelectionFromMarkets(
      cagliari,
      [marketWithoutBetId(CAGLIARI_ID)],
      'П1',
      '1X2',
      2.1,
    );
    assert.equal(unlabeled.locked, true);
    assert.equal(lsportsCardSelectionFromMarkets(cagliari, [marketWithoutBetId(CAGLIARI_ID)], 'П1', '1X2'), null);
    assert.equal(acceptLsportsSelection(unlabeled.selection), null);

    const hydrated = clickableCardSelectionFromMarkets(
      cagliari,
      [market1x2(CAGLIARI_ID, VERONA_HOME)],
      'П1',
      '1X2',
      2.1,
    );
    assert.equal(hydrated.locked, false);
    assert.equal(hydrated.selection.outcomeId, VERONA_HOME);
  });

  it('Under/Over 2.5 keeps FixtureId + Market.Id + marketKey + line + Bet.Id', () => {
    const toulouse = match('19981248', 'Toulouse', 'Lille');
    const selection = mustSelect(toulouse, marketTotals(toulouse.id), 'over');
    assert.equal(selection.fixtureId, '19981248');
    assert.equal(selection.marketId, '2');
    assert.equal(selection.marketKey, '19981248:2:2.5');
    assert.equal(selection.line, '2.5');
    assert.equal(selection.outcomeId, OVER_25);
    assertNoEmptyOutcomeId(serializeSportsPlaceBody({
      selections: [selection],
      stake: 10,
      idempotencyKey: 'uo',
    }));
  });

  it('Asian Handicap keeps full identity', () => {
    const toulouse = match('19981248', 'Toulouse', 'Lille');
    const selection = mustSelect(toulouse, marketHandicap(toulouse.id), 'home');
    assert.equal(selection.fixtureId, '19981248');
    assert.equal(selection.marketId, '1439');
    assert.equal(selection.marketKey, '19981248:1439:-1.0');
    assert.equal(selection.line, '-1.0');
    assert.equal(selection.outcomeId, AH_HOME);
    assert.equal(hasCompleteLsportsIdentity(selection), true);
  });

  it('BTTS keeps full identity', () => {
    const toulouse = match('19981248', 'Toulouse', 'Lille');
    const selection = mustSelect(toulouse, marketBtts(toulouse.id), 'yes');
    assert.equal(selection.fixtureId, '19981248');
    assert.equal(selection.marketId, '17');
    assert.equal(selection.marketKey, '19981248:17:');
    assert.equal(selection.line, '');
    assert.equal(selection.outcomeId, BTTS_YES);
  });

  it('two-leg express has real outcomeId on both legs', () => {
    const toulouse = match('19981248', 'Toulouse', 'Lille');
    const cagliari = match(CAGLIARI_ID, 'Cagliari', 'Hellas Verona');
    const first = mustSelect(toulouse, market1x2(toulouse.id, TOULOUSE_HOME), 'home');
    const second = mustSelect(cagliari, market1x2(cagliari.id, VERONA_HOME), 'home');
    const slip = addSlipSelection(addSlipSelection([], first), second);
    assert.equal(slip.length, 2);
    assert.equal(slip[0]?.outcomeId, TOULOUSE_HOME);
    assert.equal(slip[1]?.outcomeId, VERONA_HOME);
    const body = serializeSportsPlaceBody({ selections: slip, stake: 20, idempotencyKey: 'express' });
    assert.equal(body?.mode, 'express');
    assert.equal(body?.selections[0]?.outcomeId, TOULOUSE_HOME);
    assert.equal(body?.selections[1]?.outcomeId, VERONA_HOME);
    assertNoEmptyOutcomeId(body);

    const incompleteExpress = addSlipSelection([first], {
      id: `${CAGLIARI_ID}-1X2-П1`,
      matchId: CAGLIARI_ID,
      matchLabel: 'Cagliari — Hellas Verona',
      market: '1X2',
      outcome: 'П1',
      odds: 2.1,
      provider: 'lsports',
      fixtureId: CAGLIARI_ID,
    });
    assert.equal(incompleteExpress.length, 1);
    assert.equal(serializeSportsPlaceBody({
      selections: [first, {
        id: `${CAGLIARI_ID}-1X2-П1`,
        matchId: CAGLIARI_ID,
        matchLabel: 'Cagliari — Hellas Verona',
        market: '1X2',
        outcome: 'П1',
        odds: 2.1,
        provider: 'lsports',
        fixtureId: CAGLIARI_ID,
      }],
      stake: 20,
      idempotencyKey: 'bad-express',
    }), null);
  });

  it('locks a catalog card without feedTag or store markets so it cannot place', () => {
    const generic = match('evt-1', 'Home', 'Away');
    generic.feedTag = undefined;
    const clickable = clickableCardSelectionFromMarkets(generic, [], 'П1', '1X2', 2.1);
    assert.equal(clickable.locked, true);
    assert.equal(acceptLsportsSelection(clickable.selection), null);
    assert.equal(serializeSportsPlaceBody({
      selections: [clickable.selection],
      stake: 10,
      idempotencyKey: 'catalog',
    }), null);
  });

  it('never generates an LSports place body with empty or undefined outcomeId', () => {
    const toulouse = match('19981248', 'Toulouse', 'Lille');
    const complete = mustSelect(toulouse, market1x2(toulouse.id, TOULOUSE_HOME), 'home');
    assertNoEmptyOutcomeId(serializeSportsPlaceBody({
      selections: [complete],
      stake: 10,
      idempotencyKey: 'ok',
    }));

    const missing = {
      ...complete,
      outcomeId: '',
    };
    assert.equal(serializeSportsPlaceBody({
      selections: [missing],
      stake: 10,
      idempotencyKey: 'blank',
    }), null);
    assert.equal(serializeSportsPlaceBody({
      selections: [{ ...complete, outcomeId: undefined }],
      stake: 10,
      idempotencyKey: 'undef',
    }), null);
  });
});
