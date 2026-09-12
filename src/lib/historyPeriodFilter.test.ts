import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterHistoryEntries, historyPeriodStats, toHistoryEntry } from './betHistoryView';
import {
  historyPeriodLabel,
  historyPeriodRange,
  isSelectableHistoryDate,
  validateCustomHistoryRange,
} from './historyPeriodFilter';
import {
  getHistoryPeriodSelection,
  setHistoryPeriodSelection,
} from './historyPeriodStore';

const BASE = {
  betId: '20762a28-1111-4aaa-8bbb-cccccccccccc',
  mode: 'single',
  stake: 50,
  acceptedOdds: 2.2,
  potentialPayout: 109.9,
  status: 'accepted',
  settlementState: 'unsettled',
  acceptedAt: '2026-09-12T12:00:00.000Z',
  legs: [{ fixtureLabel: 'Home — Away', outcomeName: '1', acceptedOdds: 2.2 }],
};

function entry(id: string, localDate: Date, stake = 50) {
  return toHistoryEntry({
    ...BASE,
    betId: id,
    stake,
    acceptedAt: localDate.toISOString(),
  });
}

describe('history period filter', () => {
  const now = new Date(2026, 8, 12, 18, 0, 0).getTime();
  const today = entry('today', new Date(2026, 8, 12, 10, 0, 0), 100);
  const yesterday = entry('yesterday', new Date(2026, 8, 11, 10, 0, 0), 40);
  const weekAgo = entry('week', new Date(2026, 8, 6, 10, 0, 0), 20);
  const monthAgo = entry('month', new Date(2026, 7, 20, 10, 0, 0), 10);
  const old = entry('old', new Date(2026, 5, 1, 10, 0, 0), 5);
  const rows = [today, yesterday, weekAgo, monthAgo, old];

  it('all-time returns all bets', () => {
    const visible = filterHistoryEntries(rows, 'all', false, now);
    assert.equal(visible.length, 5);
    assert.deepEqual(historyPeriodStats(visible), { count: 5, stakeTotal: 175 });
  });

  it('today filters correctly', () => {
    const visible = filterHistoryEntries(rows, { kind: 'today' }, false, now);
    assert.deepEqual(visible.map((row) => row.id), [today.id]);
  });

  it('yesterday filters correctly', () => {
    const visible = filterHistoryEntries(rows, { kind: 'yesterday' }, false, now);
    assert.deepEqual(visible.map((row) => row.id), [yesterday.id]);
  });

  it('last 7 days filters correctly', () => {
    const visible = filterHistoryEntries(rows, { kind: '7d' }, false, now);
    assert.deepEqual(visible.map((row) => row.id), [today.id, yesterday.id, weekAgo.id]);
  });

  it('last 30 days filters correctly', () => {
    const visible = filterHistoryEntries(rows, { kind: '30d' }, false, now);
    assert.equal(visible.some((row) => row.id === old.id), false);
    assert.equal(visible.some((row) => row.id === today.id), true);
    assert.equal(visible.some((row) => row.id === monthAgo.id), true);
  });

  it('custom start/end range filters correctly', () => {
    const visible = filterHistoryEntries(
      rows,
      { kind: 'custom', from: '2026-09-06', to: '2026-09-11' },
      false,
      now,
    );
    assert.deepEqual(visible.map((row) => row.id), [yesterday.id, weekAgo.id]);
  });

  it('future dates cannot be selected', () => {
    assert.equal(isSelectableHistoryDate('2026-09-13', now), false);
    assert.equal(validateCustomHistoryRange('2026-09-12', '2026-09-13', now).ok, false);
    if (!validateCustomHistoryRange('2026-09-12', '2026-09-13', now).ok) {
      assert.equal(validateCustomHistoryRange('2026-09-12', '2026-09-13', now).reason, 'future');
    }
  });

  it('invalid end < start is rejected', () => {
    const result = validateCustomHistoryRange('2026-09-12', '2026-09-01', now);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'order');
    const visible = filterHistoryEntries(
      rows,
      { kind: 'custom', from: '2026-09-12', to: '2026-09-01' },
      false,
      now,
    );
    assert.equal(visible.length, 0);
  });

  it('statistics use filtered records', () => {
    const visible = filterHistoryEntries(rows, { kind: 'today' }, false, now);
    assert.deepEqual(historyPeriodStats(visible), { count: 1, stakeTotal: 100 });
    assert.notEqual(historyPeriodStats(visible).stakeTotal, historyPeriodStats(rows).stakeTotal);
  });

  it('empty result shows no matching bets for the selected range', () => {
    const visible = filterHistoryEntries(
      rows,
      { kind: 'custom', from: '2026-01-01', to: '2026-01-02' },
      false,
      now,
    );
    assert.equal(visible.length, 0);
    assert.equal(rows.length > 0, true);
  });

  it('selected range survives History -> Bet Details -> Back', () => {
    setHistoryPeriodSelection({ kind: '7d' });
    const kept = getHistoryPeriodSelection();
    assert.equal(kept.kind, '7d');
    setHistoryPeriodSelection({ kind: 'custom', from: '2026-08-12', to: '2026-09-12' });
    assert.equal(historyPeriodLabel(getHistoryPeriodSelection()), '12.08 — 12.09');
    setHistoryPeriodSelection({ kind: 'all' });
  });

  it('period labels follow the selected preset or custom range', () => {
    assert.equal(historyPeriodLabel({ kind: 'today' }), 'Сегодня');
    assert.equal(historyPeriodLabel({ kind: '30d' }), '30 дней');
    assert.equal(historyPeriodLabel('all'), 'Всё время');
    assert.equal(historyPeriodLabel({ kind: 'custom', from: '2026-08-12', to: '2026-09-12' }), '12.08 — 12.09');
  });

  it('does not include future days in a 30-day range', () => {
    const range = historyPeriodRange({ kind: '30d' }, now);
    assert.ok(range);
    assert.equal(range.endMs <= new Date(2026, 8, 12, 23, 59, 59, 999).getTime(), true);
  });
});
