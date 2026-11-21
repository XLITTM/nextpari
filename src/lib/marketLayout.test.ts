import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutLinesFromGroups, marketAccordions } from './marketLayout.js';
import { outcomeLabelFor } from './marketTaxonomy.js';
import type { MarketGroup } from '../types.js';

function group(id: string, name: string, marketFamily: string, externalMarketId: string, outcomes: Array<{ label: string; odds: number; sourceSelectionId: string }>, period = 'fulltime'): MarketGroup {
  return {
    id, name, marketFamily, externalMarketId, externalPeriodId: period,
    outcomes: outcomes.map((outcome) => ({ ...outcome, locked: true })),
  };
}

const cityFulham: MarketGroup[] = [
  group('main', 'Исход', '1x2', '101', [
    { label: 'П1', odds: 1.28, sourceSelectionId: 'id1000001772221406:1xbet:101:0' },
    { label: 'X', odds: 5.2, sourceSelectionId: 'id1000001772221406:1xbet:102:0' },
    { label: 'П2', odds: 8.1, sourceSelectionId: 'id1000001772221406:1xbet:103:0' },
  ]),
  group('total-25', 'Тотал · 2.5', 'totals', '106', [
    { label: 'Больше', odds: 1.83, sourceSelectionId: 'id1000001772221406:1xbet:106:0' },
    { label: 'Меньше', odds: 1.97, sourceSelectionId: 'id1000001772221406:1xbet:107:0' },
  ]),
  group('total-35', 'Тотал · 3.5', 'totals', '108', [
    { label: 'Больше', odds: 2.1, sourceSelectionId: 'id1000001772221406:1xbet:108:0' },
    { label: 'Меньше', odds: 1.7, sourceSelectionId: 'id1000001772221406:1xbet:109:0' },
  ]),
  group('exact', 'Точное число голов', 'exactscore', '501', [
    { label: '1', odds: 4.2, sourceSelectionId: 'id1000001772221406:1xbet:501:0' },
    { label: '2', odds: 3.4, sourceSelectionId: 'id1000001772221406:1xbet:502:0' },
  ]),
  group('score', 'Точный счёт', 'correctscore', '601', [
    { label: '1:0', odds: 6.5, sourceSelectionId: 'id1000001772221406:1xbet:601:0' },
  ]),
  group('corner-result', 'Угловые: исход', '1x2-corners', '701', [
    { label: 'П1', odds: 1.7, sourceSelectionId: 'id1000001772221406:1xbet:701:0' },
    { label: 'X', odds: 3.4, sourceSelectionId: 'id1000001772221406:1xbet:702:0' },
    { label: 'П2', odds: 4.1, sourceSelectionId: 'id1000001772221406:1xbet:703:0' },
  ]),
  group('corner-total', 'Угловые: тотал · 9.5', 'totals-corners', '801', [
    { label: 'Больше', odds: 1.8, sourceSelectionId: 'id1000001772221406:1xbet:801:0' },
    { label: 'Меньше', odds: 1.9, sourceSelectionId: 'id1000001772221406:1xbet:802:0' },
  ]),
  group('team1', 'Тотал команды 1 · 1.5', 'teamtotals-team1', '901', [
    { label: 'Больше', odds: 1.6, sourceSelectionId: 'id1000001772221406:1xbet:901:0' },
  ]),
  group('team2', 'Тотал команды 2 · 0.5', 'teamtotals-team2', '902', [
    { label: 'Больше', odds: 2.2, sourceSelectionId: 'id1000001772221406:1xbet:902:0' },
  ]),
  group('half', 'Тотал · 0.5', 'totals', '950', [
    { label: 'Больше', odds: 1.4, sourceSelectionId: 'id1000001772221406:1xbet:950:0' },
  ], 'p1'),
  group('scorer', 'Игрок забьёт', 'players-anytimegoalscorer', '1001', [
    { label: 'Да', odds: 1.9, sourceSelectionId: 'id1000001772221406:1xbet:1001:44' },
    { label: 'Нет', odds: 1.8, sourceSelectionId: 'id1000001772221406:1xbet:1002:44' },
    { label: 'Да', odds: 2.4, sourceSelectionId: 'id1000001772221406:1xbet:1001:55' },
  ]),
];

test('keeps numeric exact-goal outcomes and separates incompatible markets', () => {
  assert.equal(outcomeLabelFor('exactscore', '1'), '1');
  assert.equal(outcomeLabelFor('exactscore', '2'), '2');
  assert.equal(outcomeLabelFor('1x2', '1'), 'П1');
  assert.equal(outcomeLabelFor('1x2', '2'), 'П2');
  assert.equal(outcomeLabelFor('correctscore', '1:0'), '1:0');
  const accordions = marketAccordions(layoutLinesFromGroups(cityFulham, 'football'), 'all', '', 'football');
  const titles = accordions.map((item) => item.title);
  assert.equal(titles.filter((title) => title === '1X2').length, 1);
  assert.deepEqual(accordions.find((item) => item.family === 'totals' && !item.periodId?.startsWith('p'))?.lines.map((line) => line.line), ['2.5', '3.5']);
  assert.equal(accordions.filter((item) => item.family === '1x2-corners' || item.family === 'totals-corners').length, 2);
  assert.equal(accordions.find((item) => item.family === 'exactscore')?.lines[0]?.outcomes.map((item) => item.label).join(','), '1,2');
  assert.equal(accordions.find((item) => item.family === 'correctscore')?.lines[0]?.outcomes[0]?.label, '1:0');
  assert.notEqual(accordions.find((item) => item.family === 'teamtotals-team1')?.id, accordions.find((item) => item.family === 'teamtotals-team2')?.id);
  assert.equal(accordions.find((item) => item.periodId === 'p1' && item.title === 'Тотал')?.periodId, 'p1');
  const players = accordions.find((item) => item.family === 'players-anytimegoalscorer');
  assert.equal(players?.lines.length, 2);
  assert.equal(players?.lines.some((line) => line.line === '44' && line.outcomes.length === 2), true);
  const ids = accordions.flatMap((item) => item.lines.flatMap((line) => line.outcomes.map((outcome) => outcome.sourceSelectionId)));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(titles.indexOf('1X2') < titles.indexOf('Тотал'), true);
  assert.equal(titles.indexOf('Тотал') < titles.indexOf('Угловые: исход'), true);
});
