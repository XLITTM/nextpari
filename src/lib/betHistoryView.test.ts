import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ParsedMarket } from './odds-parser';
import type { MatchEvent } from '../types';
import {
  currentSelectionFromHistoryLeg,
  detailsView,
  formatBetDateTime,
  historyCardView,
  historyPeriodStats,
  historyViewHasTechnicalIds,
  planRepeatCoupon,
  playerStatus,
  playerStatusLabel,
  toHistoryEntry,
} from './betHistoryView';

const SINGLE_RAW = {
  betId: '20762a28-1111-4aaa-8bbb-cccccccccccc',
  mode: 'single',
  stake: 50,
  acceptedOdds: 2.2,
  potentialPayout: 109.9,
  status: 'accepted',
  settlementState: 'unsettled',
  acceptedAt: '2026-09-03T19:04:28.489738+00:00',
  legs: [{
    fixtureId: 19852841,
    marketId: '1',
    marketKey: '19852841:1:',
    line: '',
    outcomeId: '117469638719852841',
    outcomeName: '2',
    acceptedOdds: 2.2,
    fixtureLabel: 'Toulouse — Lille',
    league: 'Ligue 1',
  }],
};

const EXPRESS_RAW = {
  betId: '86595415-901a-4ccc-8ddd-eeeeeeeeeeee',
  mode: 'express',
  stake: 50,
  acceptedOdds: 644.442,
  potentialPayout: 32222.12,
  status: 'accepted',
  settlementState: 'unsettled',
  acceptedAt: '2026-09-03T16:35:00.000Z',
  legs: Array.from({ length: 17 }, (_, index) => ({
    fixtureId: 19900000 + index,
    marketId: index % 2 === 0 ? '1' : '2',
    marketKey: `${19900000 + index}:${index % 2 === 0 ? '1' : '2'}:${index % 2 === 0 ? '' : '2.5'}`,
    line: index % 2 === 0 ? '' : '2.5',
    outcomeId: `${330000000000000000 + index}`,
    outcomeName: index % 2 === 0 ? '1' : 'Over',
    acceptedOdds: 1.3 + index / 100,
    fixtureLabel: `Home ${index} — Away ${index}`,
    league: 'Serie A',
    settlementCode: index < 3 ? 2 : null,
  })),
};

describe('bet history presentation', () => {
  it('formats raw database timestamps for the player', () => {
    assert.equal(formatBetDateTime(new Date(2026, 8, 3, 19, 4, 28)), '03.09.2026 (19:04)');
    const fromIso = formatBetDateTime('2026-09-03T19:04:28.489738+00:00');
    assert.match(fromIso, /^\d{2}\.\d{2}\.\d{4} \(\d{2}:\d{2}\)$/);
    assert.equal(fromIso.includes('T19:04:28'), false);
    assert.equal(fromIso.includes('+00:00'), false);
  });

  it('renders a compact single bet history card', () => {
    const entry = toHistoryEntry(SINGLE_RAW);
    const card = historyCardView(entry);
    assert.equal(card.typeLabel, 'Ординар');
    assert.equal(card.odds, '2.20');
    assert.match(card.stake, /50/);
    assert.match(card.potential, /109/);
    assert.equal(card.statusLabel, 'Принята');
    assert.equal(card.couponNo, '20762A28');
    assert.equal(historyViewHasTechnicalIds(card.visibleText), false);
  });

  it('renders an express history card with leg count', () => {
    const entry = toHistoryEntry(EXPRESS_RAW);
    const card = historyCardView(entry);
    assert.equal(card.typeLabel, 'Экспресс 17');
    assert.equal(entry.events.length, 17);
    assert.equal(historyViewHasTechnicalIds(card.visibleText), false);
  });

  it('maps accepted, won, lost, and refund statuses', () => {
    assert.equal(playerStatusLabel(playerStatus({ status: 'accepted', settlementState: 'unsettled', rawStatus: 'accepted' })), 'Принята');
    assert.equal(playerStatusLabel(playerStatus({ status: 'won', settlementState: 'winner' })), 'Выиграна');
    assert.equal(playerStatusLabel(playerStatus({ status: 'lost', settlementState: 'loser' })), 'Проиграна');
    assert.equal(playerStatusLabel(playerStatus({ status: 'refund', settlementState: 'refund' })), 'Возврат');
  });

  it('does not render technical provider IDs on details', () => {
    const entry = toHistoryEntry(SINGLE_RAW);
    const view = detailsView(entry);
    assert.equal(view.legs[0]?.market, '1X2');
    assert.equal(view.legs[0]?.selection, 'П2');
    assert.equal(view.legs[0]?.homeTeam, 'Toulouse');
    assert.equal(view.legs[0]?.awayTeam, 'Lille');
    assert.equal(historyViewHasTechnicalIds(view.visibleText), false);
    assert.equal(view.visibleText.includes('19852841:1:'), false);
    assert.equal(view.visibleText.includes('117469638719852841'), false);
    assert.equal(view.visibleText.includes('marketKey'), false);
  });

  it('renders friendly single details and all express legs', () => {
    const single = detailsView(toHistoryEntry(SINGLE_RAW));
    assert.equal(single.typeLabel, 'Ординар');
    assert.equal(single.legs.length, 1);
    const express = detailsView(toHistoryEntry(EXPRESS_RAW));
    assert.equal(express.typeLabel, 'Экспресс');
    assert.equal(express.eventsLabel, 'Событий: 17');
    assert.equal(express.progressLabel, 'Завершено: 3 из 17');
    assert.equal(express.legs.length, 17);
    assert.equal(express.legs.every((leg) => !historyViewHasTechnicalIds(leg.market + leg.selection)), true);
  });

  it('calculates statistics count and total stake from loaded history', () => {
    const rows = [toHistoryEntry(SINGLE_RAW), toHistoryEntry(EXPRESS_RAW)];
    assert.deepEqual(historyPeriodStats(rows), { count: 2, stakeTotal: 100 });
  });

  it('keeps a missing team logo optional so the card still renders', () => {
    const view = detailsView(toHistoryEntry(SINGLE_RAW));
    assert.equal(view.legs[0]?.homeLogo, undefined);
    assert.equal(view.legs[0]?.homeTeam, 'Toulouse');
  });

  it('renders an old historical bet without a current live fixture', () => {
    const entry = toHistoryEntry(SINGLE_RAW);
    const view = detailsView(entry, {});
    assert.equal(view.legs[0]?.homeTeam, 'Toulouse');
    assert.equal(view.legs[0]?.market, '1X2');
    assert.equal(view.legs[0]?.selection, 'П2');
    assert.equal(historyViewHasTechnicalIds(view.visibleText), false);
  });

  it('does not reuse stale accepted odds when repeating a coupon', () => {
    const entry = toHistoryEntry(SINGLE_RAW);
    const empty = planRepeatCoupon(entry, () => null);
    assert.equal(empty.canRepeat, false);
    assert.equal(empty.selections.length, 0);

    const stale = entry.events[0]!;
    const markets: ParsedMarket[] = [{
      key: '1_1',
      bookmaker: '1',
      marketId: '1',
      name: '1X2',
      category: 'main',
      canonicalKey: '19852841:1:',
      entries: [{
        id: 'live',
        canonicalKey: '19852841:1:',
        updatedAt: 1,
        outcomes: [
          { key: 'home', odds: 1.9, raw: '1.90', providerBetId: '999000111222333444' },
          { key: 'draw', odds: 3.4, raw: '3.40', providerBetId: '999000111222333445' },
          { key: 'away', odds: 4.1, raw: '4.10', providerBetId: '999000111222333446' },
        ],
      }],
    }];
    const match: MatchEvent = {
      id: '19852841',
      sport: 'football',
      league: 'Ligue 1',
      country: 'France',
      team1: 'Toulouse',
      team2: 'Lille',
      team1Color: '#000',
      team2Color: '#fff',
      startTime: 0,
      isLive: true,
      extraMarkets: 1,
      markets: { '1': 1.9, x: 3.4, '2': 4.1 },
    };
    const current = currentSelectionFromHistoryLeg(match, markets, stale);
    assert.ok(current);
    assert.equal(current.odds, 4.1);
    assert.notEqual(current.odds, stale.odds);
    assert.equal(current.outcomeId, '999000111222333446');
    assert.notEqual(current.outcomeId, '117469638719852841');

    const plan = planRepeatCoupon(entry, () => current);
    assert.equal(plan.canRepeat, true);
    assert.equal(plan.selections[0]?.odds, 4.1);
  });
});
