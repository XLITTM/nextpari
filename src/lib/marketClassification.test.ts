import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isQuarterLine, placeFootballMarket } from './marketTaxonomy.js';
import { layoutLinesFromGroups, marketAccordions, marketTabs, type LayoutLine } from './marketLayout.js';
import type { MarketGroup } from '../types.js';

function placed(marketType: string, handicap: number | null, period = 'fulltime') {
  return placeFootballMarket({ marketType, handicap, period, marketName: marketType });
}

function line(id: string, family: string, value: string, periodId = 'fulltime', marketId = id): LayoutLine {
  return {
    id,
    family,
    period: periodId !== 'fulltime',
    periodId,
    title: family,
    line: value,
    outcomes: [{
      label: 'Больше',
      odds: 1.91,
      locked: true,
      sourceSelectionId: `sel:${marketId}`,
      externalMarketId: marketId,
      externalPeriodId: periodId,
    }],
  };
}

test('quarter-lines are the .25 and .75 handicaps, including negatives', () => {
  assert.equal(isQuarterLine(2.25), true);
  assert.equal(isQuarterLine(2.75), true);
  assert.equal(isQuarterLine(-0.25), true);
  assert.equal(isQuarterLine(0.75), true);
  assert.equal(isQuarterLine(-1.25), true);
  assert.equal(isQuarterLine(1.75), true);
  assert.equal(isQuarterLine(2.5), false);
  assert.equal(isQuarterLine(-1), false);
  assert.equal(isQuarterLine(0), false);
  assert.equal(isQuarterLine(0.5), false);
  assert.equal(isQuarterLine(null), false);
});

test('football markets keep provider identity across totals, handicaps, corners and cards', () => {
  assert.equal(placed('totals', 2.5).tab, 'totals');
  assert.equal(placed('totals', 2.25).tab, 'asian-totals');
  assert.equal(placed('totals', 2.75).tab, 'asian-totals');
  assert.equal(placed('spreads', -0.25).tab, 'asian-handicap');
  assert.equal(placed('spreads', 0.75).tab, 'asian-handicap');
  assert.equal(placed('spreads', -1).tab, 'asian-handicap');
  assert.equal(placed('spreads', 0).tab, 'asian-handicap');
  assert.equal(placed('spreads', -0.5).tab, 'asian-handicap');
  assert.equal(placed('spreads-european', -1).tab, 'european-handicap');
  assert.equal(placed('spreads-european', -0.25).tab, 'european-handicap');
  assert.equal(placed('totals-corners', 9.5).tab, 'corners');
  assert.equal(placed('totals-corners', 9.5).bucket.startsWith('corners:'), true);
  assert.equal(placed('totals-corners', 9.25).tab, 'corners');
  assert.equal(placed('totals-corners', 9.25).bucket.startsWith('corners-asian:'), true);
  assert.equal(placed('totals-corners', 9.25).label, 'Угловые: азиатский тотал');
  assert.equal(placed('spreads-corners', -0.75).tab, 'corners');
  assert.equal(placed('spreads-corners', -0.75).bucket.startsWith('corners-asian:'), true);
  assert.equal(placed('spreads-corners', -0.75).label, 'Угловые: азиатская фора');
  assert.equal(placed('totals-bookings', 4.5).tab, 'cards');
  assert.equal(placed('spreads-bookings', -0.5).tab, 'cards');
  assert.equal(placed('1x2-bookings', null).tab, 'cards');
  const half = placed('totals', 1.25, 'p1');
  assert.equal(half.tab, 'periods');
  assert.equal(half.label, 'Азиатский тотал');
  assert.match(half.bucket, /p1/);
  assert.notEqual(half.bucket, placed('totals', 2.25).bucket);
  const team = placed('teamtotals-team1', 1.25);
  assert.equal(team.tab, 'team-totals');
  assert.match(team.bucket, /^team-totals-asian:team1/);
  assert.notEqual(team.tab, 'asian-totals');
  assert.equal(placed('teamtotals-team2', 1.5).bucket, 'team-totals:team2');
  assert.equal(placed('1x2', 0).tab, 'main');
  assert.equal(placed('doublechance', null).tab, 'main');
  assert.equal(placed('bothteamsscore', null).tab, 'main');
  assert.equal(placed('correctscore', null).tab, 'other');
  assert.equal(placed('firstgoal', null).tab, 'other');
  assert.equal(placed('totals', 0.5, 'p1').tab, 'periods');
  assert.equal(placed('totals', 0.5, 'p1').label, 'Тотал');
  assert.notEqual(placed('totals', 0.5, 'p1').bucket, half.bucket);
});

test('match detail sections split quarter lines and keep every selection', () => {
  const lines = [
    line('a', 'totals', '2.5', 'fulltime', '1010'),
    line('b', 'totals', '2.25', 'fulltime', '1012'),
    line('c', 'totals', '2.75', 'fulltime', '1014'),
    line('d', 'spreads', '-0.25', 'fulltime', '1070'),
    line('e', 'spreads', '0.75', 'fulltime', '1074'),
    line('f', 'spreads', '-1', 'fulltime', '1078'),
    line('g', 'spreads-european', '-1', 'fulltime', '1090'),
    line('h', 'totals-corners', '9.5', 'fulltime', '10803'),
    line('i', 'totals-corners', '9.25', 'fulltime', '10807'),
    line('j', 'spreads-corners', '-0.75', 'fulltime', '10820'),
    line('k', 'totals-bookings', '4.5', 'fulltime', '1060'),
    line('l', 'totals', '1.25', 'p1', '201'),
    line('m', 'teamtotals-team1', '1.25', 'fulltime', '10408'),
    line('n1', 'totals', '2.5', 'fulltime', '1016'),
    line('n2', 'totals-corners', '2.5', 'fulltime', '10830'),
    line('o', 'correctscore', '', 'fulltime', '130'),
  ];
  lines[13]!.title = 'Total';
  lines[14]!.title = 'Total';
  const tabs = marketTabs(lines, 'football').map((tab) => tab.label);
  assert.deepEqual(tabs, [
    'Все', 'Тоталы', 'Азиатские тоталы', 'Европейская фора', 'Азиатская фора',
    'Угловые', 'Карточки', 'Тоталы команд', 'Таймы', 'Другие',
  ]);
  const all = marketAccordions(lines, 'all', '', 'football');
  const shown = all.flatMap((accordion) => accordion.lines);
  assert.equal(shown.length, lines.length);
  assert.deepEqual(
    shown.map((item) => item.outcomes[0]?.externalMarketId).sort(),
    lines.map((item) => item.outcomes[0]?.externalMarketId).sort(),
  );
  assert.ok(shown.every((item, index) => item.outcomes[0]?.odds === lines.find((source) => source.id === item.id)?.outcomes[0]?.odds));
  assert.ok(shown.every((item) => item.outcomes[0]?.externalPeriodId === item.periodId));
  const totals = marketAccordions(lines, 'totals', '', 'football');
  assert.deepEqual(totals.flatMap((accordion) => accordion.lines.map((item) => item.line)).sort(), ['2.5', '2.5']);
  const asianTotals = marketAccordions(lines, 'asian-totals', '', 'football');
  assert.deepEqual(asianTotals.flatMap((accordion) => accordion.lines.map((item) => item.line)).sort(), ['2.25', '2.75']);
  assert.equal(marketAccordions(lines, 'asian-handicap', '', 'football').flatMap((accordion) => accordion.lines).length, 3);
  assert.equal(marketAccordions(lines, 'european-handicap', '', 'football')[0]?.lines[0]?.outcomes[0]?.externalMarketId, '1090');
  const corners = marketAccordions(lines, 'corners', '', 'football');
  assert.equal(corners.flatMap((accordion) => accordion.lines).length, 4);
  assert.equal(corners.length, 3);
  assert.equal(corners.filter((accordion) => accordion.id.startsWith('corners-asian:')).length, 2);
  assert.equal(marketAccordions(lines, 'cards', '', 'football')[0]?.lines[0]?.line, '4.5');
  const half = all.find((accordion) => accordion.periodId === 'p1' && accordion.title.startsWith('Азиатский тотал'));
  assert.equal(half?.lines[0]?.outcomes[0]?.externalMarketId, '201');
  assert.equal(half?.lines[0]?.outcomes[0]?.externalPeriodId, 'p1');
  assert.equal(marketAccordions(lines, 'team-totals', '', 'football')[0]?.title, 'Азиатский тотал команды 1');
  const sameName = all.filter((accordion) => accordion.lines.some((item) => item.title === 'Total'));
  assert.equal(sameName.length, 2);
  assert.notEqual(sameName[0]?.id, sameName[1]?.id);
  const covered = marketTabs(lines, 'football')
    .filter((tab) => tab.id !== 'all')
    .flatMap((tab) => marketAccordions(lines, tab.id, '', 'football').flatMap((accordion) => accordion.lines.map((item) => item.id)));
  assert.equal(covered.length, lines.length);
  assert.equal(new Set(covered).size, lines.length);
});

test('groups built from provider rows keep the numeric line and the market id', () => {
  const groups: MarketGroup[] = [
    {
      id: 'goal-2.5',
      name: 'Тотал · 2.5',
      category: 'totals',
      marketFamily: 'totals',
      handicap: 2.5,
      externalMarketId: '1010',
      externalPeriodId: 'fulltime',
      outcomes: [{ label: 'Больше', odds: 1.87, locked: true, sourceSelectionId: 'id:1xbet:21:0' }],
    },
    {
      id: 'goal-2.25',
      name: 'Азиатский тотал · 2.25',
      category: 'asian-totals',
      marketFamily: 'totals',
      handicap: 2.25,
      externalMarketId: '1012',
      externalPeriodId: 'fulltime',
      outcomes: [{ label: 'Меньше', odds: 1.95, locked: true, sourceSelectionId: 'id:1xbet:31:0' }],
    },
  ];
  const accordions = marketAccordions(layoutLinesFromGroups(groups, 'football'), 'all', '', 'football');
  assert.equal(accordions.length, 2);
  assert.deepEqual(accordions.map((accordion) => accordion.lines[0]?.line), ['2.5', '2.25']);
  assert.deepEqual(accordions.map((accordion) => accordion.lines[0]?.outcomes[0]?.odds), [1.87, 1.95]);
  assert.deepEqual(accordions.map((accordion) => accordion.lines[0]?.outcomes[0]?.externalMarketId), ['1010', '1012']);
});

test('other sports do not receive the football handicap tabs', () => {
  const tabs = marketTabs([line('spread', 'spreads', '-1.5')], 'basketball');
  assert.deepEqual(tabs.map((tab) => tab.label), ['Основная игра']);
});
