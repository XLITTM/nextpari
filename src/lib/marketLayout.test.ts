import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutLinesFromGroups, marketAccordions, marketTabs } from './marketLayout.js';
import type { MarketGroup } from '../types.js';

const groups: MarketGroup[] = [
  group('totals-25', 'Тотал · 2.5', 'totals', '101', [{ label: 'ТБ', odds: 1.83 }, { label: 'ТМ', odds: 1.97 }]),
  group('totals-35', 'Тотал · 3.5', 'totals', '102', [{ label: 'ТБ', odds: 2.1 }, { label: 'ТМ', odds: 1.7 }]),
  group('ah', 'Фора · -0.5', 'asian-handicap', '201', [{ label: 'П1', odds: 1.9 }, { label: 'П2', odds: 1.9 }]),
  group('eh', 'Европейская фора · -1', 'european-handicap', '202', [{ label: 'П1', odds: 2.4 }, { label: 'X', odds: 3.3 }, { label: 'П2', odds: 2.6 }]),
  group('team', 'Индивидуальный тотал · 1.5', 'team-totals', '301', [{ label: 'ТБ', odds: 1.8 }, { label: 'ТМ', odds: 1.95 }]),
  group('corner', 'Угловые · 8.5', 'corners', '401', [{ label: 'ТБ', odds: 1.72 }, { label: 'ТМ', odds: 2.02 }], 'fulltime'),
  group('half', 'Тотал · 0.5', 'totals', '501', [{ label: 'ТБ', odds: 1.4 }, { label: 'ТМ', odds: 2.7 }], 'p1'),
  group('player', 'Игрок забьет', 'players', '601', [{ label: 'Да', odds: 2.5 }, { label: 'Нет', odds: 1.5 }]),
];

function group(id: string, name: string, marketFamily: string, externalMarketId: string, outcomes: Array<{ label: string; odds: number }>, period = 'fulltime'): MarketGroup {
  return {
    id,
    name,
    marketFamily,
    externalMarketId,
    externalPeriodId: period,
    outcomes: outcomes.map((outcome) => ({ ...outcome, locked: true, sourceSelectionId: `${externalMarketId}:${outcome.label}` })),
  };
}

test('groups exact total and handicap lines inside one accordion per family', () => {
  const lines = layoutLinesFromGroups(groups, 'football');
  const accordions = marketAccordions(lines, 'all', '', 'football');
  const totals = accordions.find((item) => item.title === 'Тотал');
  const handicaps = accordions.filter((item) => item.family === 'asian-handicap' || item.family === 'european-handicap');
  assert.equal(totals?.lines.map((line) => line.line).join(','), '2.5,3.5');
  assert.equal(totals?.lines[0]?.outcomes[0]?.odds, 1.83);
  assert.equal(totals?.lines[0]?.outcomes[0]?.sourceSelectionId, '101:ТБ');
  assert.equal(handicaps.length, 2);
  assert.equal(accordions.find((item) => item.family === 'team-totals')?.lines.length, 1);
  assert.equal(accordions.find((item) => item.title === 'Тотал · 1-й тайм')?.lines[0]?.line, '0.5');
  assert.equal(accordions.some((item) => item.title.includes('Угловые')), true);
  assert.equal(accordions.some((item) => item.family === 'players'), true);
});

test('search and sport tabs only show families that exist', () => {
  const lines = layoutLinesFromGroups(groups, 'football');
  assert.deepEqual(marketTabs(lines, 'football').map((tab) => tab.label), ['Все', 'Тоталы', 'Форы', 'Инд. тоталы', 'Угловые', 'Таймы', 'Игроки']);
  const found = marketAccordions(lines, 'all', 'европейская', 'football');
  assert.equal(found.length, 1);
  assert.equal(found[0]?.family, 'european-handicap');
  assert.equal(marketAccordions(lines, 'periods', '', 'basketball')[0]?.title.includes('четверть'), true);
});
