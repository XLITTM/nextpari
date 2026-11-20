import assert from 'node:assert/strict';
import { test } from 'node:test';
import { outcomeLabelFor, subtypeLabel } from './marketTaxonomy.js';

test('translates only the verified outcome for that market type', () => {
  assert.equal(outcomeLabelFor('1x2', '1'), 'П1');
  assert.equal(outcomeLabelFor('exactscore', '1'), '1');
  assert.equal(outcomeLabelFor('exactscore', '2'), '2');
  assert.equal(outcomeLabelFor('correctscore', '2:1'), '2:1');
  assert.equal(outcomeLabelFor('totals', 'Over'), 'Больше');
  assert.equal(outcomeLabelFor('oddeven', 'Odd'), 'Нечет');
  assert.equal(outcomeLabelFor('oddeven', 'Even'), 'Чёт');
  assert.equal(outcomeLabelFor('firstgoal', 'No Goal'), 'Гола не будет');
  assert.equal(outcomeLabelFor('halftime-fulltime', '1/X'), 'П1/X');
  assert.equal(subtypeLabel({ marketType: 'totals-corners', marketName: 'Corners - Over Under Full Time', period: 'fulltime', handicap: 9.5 }), 'Угловые: тотал');
  assert.equal(subtypeLabel({ marketType: 'winningmargin', marketName: 'Winning Margin Full Time', period: 'fulltime', handicap: null }), 'Победа с разницей');
  assert.equal(subtypeLabel({ marketType: 'teamtotals-bookings-team1', marketName: 'Bookings - Over Under Team 1', period: 'fulltime', handicap: 1.5 }), 'Карточки: тотал команды 1');
  assert.equal(subtypeLabel({ marketType: '2up', marketName: '2Up - Full Time Result', period: 'fulltime', handicap: null }), '2Up - Full Time Result');
  assert.equal(outcomeLabelFor('winningmargin', '1 By 2'), '1 By 2');
});
