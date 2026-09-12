import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  betTypeLabel,
  detailsView,
  filterHistoryEntries,
  formatBetDateTime,
  hasRealCashout,
  historyCardView,
  historyPeriodStats,
  historyViewHasTechnicalIds,
  isExpressBet,
  legResultLabel,
  legStatus,
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
    marketName: index % 2 === 0 ? '1X2' : 'Тотал',
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
    assert.equal(card.typeLabel, 'Одиночная');
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
    assert.equal(card.typeLabel, 'Экспресс');
    assert.equal(card.legCount, 17);
    assert.equal(entry.events.length, 17);
    assert.equal(historyViewHasTechnicalIds(card.visibleText), false);
  });

  it('maps accepted, won, lost, refund, and cancelled statuses', () => {
    assert.equal(playerStatusLabel(playerStatus({ status: 'accepted', settlementState: 'unsettled', rawStatus: 'accepted', events: [] })), 'Принята');
    assert.equal(playerStatusLabel(playerStatus({ status: 'won', settlementState: 'winner', events: [] })), 'Выиграна');
    assert.equal(playerStatusLabel(playerStatus({ status: 'lost', settlementState: 'loser', events: [] })), 'Проиграна');
    assert.equal(playerStatusLabel(playerStatus({ status: 'refund', settlementState: 'refund', events: [] })), 'Возврат');
    assert.equal(playerStatusLabel(playerStatus({ status: 'cancelled', settlementState: 'cancelled', events: [] })), 'Отменена');
  });

  it('does not render technical provider IDs on details', () => {
    const entry = toHistoryEntry(SINGLE_RAW);
    const view = detailsView(entry);
    assert.equal(view.legs[0]?.market, 'Исход');
    assert.equal(view.legs[0]?.selection, 'П2');
    assert.equal(view.legs[0]?.homeTeam, 'Toulouse');
    assert.equal(view.legs[0]?.awayTeam, 'Lille');
    assert.equal(historyViewHasTechnicalIds(view.visibleText), false);
    assert.equal(view.visibleText.includes('19852841:1:'), false);
    assert.equal(view.visibleText.includes('117469638719852841'), false);
    assert.equal(view.visibleText.includes('marketKey'), false);
    assert.equal(view.visibleText.includes('fixtureId'), false);
  });

  it('renders friendly single details and all express legs', () => {
    const single = detailsView(toHistoryEntry(SINGLE_RAW));
    assert.equal(single.typeLabel, 'Одиночная');
    assert.equal(single.legs.length, 1);
    const express = detailsView(toHistoryEntry(EXPRESS_RAW));
    assert.equal(express.typeLabel, 'Экспресс');
    assert.equal(express.eventsLabel, 'Событий: 17');
    assert.equal(express.progressLabel, 'Завершено: 3 из 17');
    assert.equal(express.legs.length, 17);
    assert.equal(express.legs.every((leg) => !historyViewHasTechnicalIds(leg.market + leg.selection)), true);
  });

  it('labels a single bet Одиночная from canonical type, not from a screenshot string', () => {
    const entry = toHistoryEntry(SINGLE_RAW);
    assert.equal(entry.type, 'single');
    assert.equal(isExpressBet(entry), false);
    assert.equal(betTypeLabel(entry), 'Одиночная');
    assert.equal(historyCardView(entry).typeLabel, 'Одиночная');
    assert.equal(detailsView(entry).typeLabel, 'Одиночная');
  });

  it('labels an express bet Экспресс from canonical type even if only one leg is present', () => {
    const entry = toHistoryEntry({ ...EXPRESS_RAW, legs: EXPRESS_RAW.legs.slice(0, 1) });
    assert.equal(entry.type, 'express');
    assert.equal(entry.events.length, 1);
    assert.equal(isExpressBet(entry), true);
    assert.equal(betTypeLabel(entry), 'Экспресс');
    assert.equal(historyCardView(entry).typeLabel, 'Экспресс');
    assert.equal(detailsView(entry).typeLabel, 'Экспресс');
  });

  it('does not relabel a canonical single as express just because extra legs exist', () => {
    const entry = { ...toHistoryEntry(SINGLE_RAW), type: 'single' as const, events: toHistoryEntry(EXPRESS_RAW).events };
    assert.equal(entry.type, 'single');
    assert.equal(entry.events.length > 1, true);
    assert.equal(betTypeLabel(entry), 'Одиночная');
    assert.equal(historyCardView(entry).typeLabel, 'Одиночная');
    assert.equal(detailsView(entry).typeLabel, 'Одиночная');
  });

  it('falls back to leg count only when canonical type is missing', () => {
    const untitledExpress = { type: undefined as unknown as 'single', events: toHistoryEntry(EXPRESS_RAW).events };
    const untitledSingle = { type: undefined as unknown as 'single', events: toHistoryEntry(SINGLE_RAW).events };
    assert.equal(betTypeLabel(untitledExpress), 'Экспресс');
    assert.equal(betTypeLabel(untitledSingle), 'Одиночная');
  });

  it('renders every express leg on the detail view', () => {
    const express = detailsView(toHistoryEntry(EXPRESS_RAW));
    assert.equal(express.typeLabel, 'Экспресс');
    assert.equal(express.legs.length, EXPRESS_RAW.legs.length);
    assert.equal(express.legs.length, 17);
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
    assert.equal(view.legs[0]?.market, 'Исход');
    assert.equal(view.legs[0]?.selection, 'П2');
    assert.equal(historyViewHasTechnicalIds(view.visibleText), false);
  });

  it('filters by 30 days using accepted dates and ignores invalid dates', () => {
    const recent = toHistoryEntry({ ...SINGLE_RAW, acceptedAt: new Date(2026, 8, 8, 12, 0).toISOString() });
    const old = toHistoryEntry({ ...SINGLE_RAW, betId: 'old', acceptedAt: new Date(2026, 6, 1, 12, 0).toISOString() });
    const invalid = toHistoryEntry({ ...SINGLE_RAW, betId: 'bad', acceptedAt: 'not-a-date' });
    const now = new Date(2026, 8, 9, 12, 0).getTime();
    const month = filterHistoryEntries([recent, old, invalid], '30d', false, now);
    assert.equal(month.some((row) => row.id === recent.id), true);
    assert.equal(month.some((row) => row.id === old.id), false);
    assert.equal(month.some((row) => row.id === invalid.id), false);
    assert.equal(filterHistoryEntries([recent, old, invalid], 'all', false, now).length, 3);
  });

  it('maps canonical settlement codes to existing coarse UI statuses', () => {
    const eventWithCode = (settlementCode: number | null) => (
      toHistoryEntry({
        ...SINGLE_RAW,
        legs: [{ ...SINGLE_RAW.legs[0], settlementCode }],
      }).events[0]
    );
    assert.equal(legStatus(eventWithCode(1)), 'lost');
    assert.equal(legStatus(eventWithCode(2)), 'won');
    assert.equal(legStatus(eventWithCode(3)), 'refund');
    assert.equal(legStatus(eventWithCode(4)), 'lost');
    assert.equal(legStatus(eventWithCode(5)), 'won');
    assert.equal(legStatus(eventWithCode(-1)), 'cancelled');
    assert.equal(legResultLabel(legStatus(eventWithCode(4))), 'Проигрыш');
    assert.equal(detailsView(toHistoryEntry({
      ...SINGLE_RAW,
      legs: [{ ...SINGLE_RAW.legs[0], settlementCode: 4 }],
    })).legs[0]?.status, 'lost');
  });

  it('only treats a real cashout amount as sale-eligible', () => {
    const withCashout = toHistoryEntry({ ...SINGLE_RAW, cashout: 40 });
    const without = toHistoryEntry(SINGLE_RAW);
    assert.equal(hasRealCashout(withCashout), true);
    assert.equal(hasRealCashout(without), false);
    const sale = filterHistoryEntries([withCashout, without], 'all', true);
    assert.equal(sale.length, 1);
    assert.equal(sale[0]?.id, withCashout.id);
  });
});
