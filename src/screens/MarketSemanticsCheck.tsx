import { OddsPapiMarketBoard } from '@/components/OddsPapiMarketBoard';
import type { MarketGroup, MatchEvent } from '@/types';

const groups: MarketGroup[] = [
  market('Исход', '1x2', '101', 'fulltime', [['П1', 1.28, '101'], ['X', 5.2, '102'], ['П2', 8.1, '103']]),
  market('Двойной шанс', 'doublechance', '121', 'fulltime', [['1X', 1.12, '121'], ['12', 1.4, '122'], ['X2', 2.1, '123']]),
  market('Тотал · 2.5', 'totals', '106', 'fulltime', [['Больше', 1.83, '106'], ['Меньше', 1.97, '107']]),
  market('Тотал · 3.5', 'totals', '108', 'fulltime', [['Больше', 2.1, '108'], ['Меньше', 1.7, '109']]),
  market('Азиатская фора · -1.5', 'spreads', '201', 'fulltime', [['П1', 1.9, '201'], ['П2', 1.9, '202']]),
  market('Европейская фора · -1', 'spreads-european', '211', 'fulltime', [['П1', 2.4, '211'], ['X', 3.3, '212'], ['П2', 2.6, '213']]),
  market('Тотал команды 1 · 1.5', 'teamtotals-team1', '301', 'fulltime', [['Больше', 1.6, '301'], ['Меньше', 2.2, '302']]),
  market('Тотал команды 2 · 0.5', 'teamtotals-team2', '311', 'fulltime', [['Больше', 2.2, '311'], ['Меньше', 1.6, '312']]),
  market('Точный счёт', 'correctscore', '401', 'fulltime', [['1:0', 6.5, '401'], ['2:1', 8, '402']]),
  market('Точное число голов', 'exactscore', '501', 'fulltime', [['1', 4.2, '501'], ['2', 3.4, '502']]),
  market('Угловые: исход', '1x2-corners', '701', 'fulltime', [['П1', 1.7, '701'], ['X', 3.4, '702'], ['П2', 4.1, '703']]),
  market('Угловые: тотал · 9.5', 'totals-corners', '801', 'fulltime', [['Больше', 1.8, '801'], ['Меньше', 1.9, '802']]),
  market('Тотал · 0.5', 'totals', '901', 'p1', [['Больше', 1.4, '901'], ['Меньше', 2.7, '902']]),
];

function market(name: string, marketFamily: string, externalMarketId: string, period: string, rows: Array<[string, number, string]>): MarketGroup {
  return {
    id: externalMarketId,
    name,
    marketFamily,
    externalMarketId,
    externalPeriodId: period,
    outcomes: rows.map(([label, odds, outcomeId]) => ({
      label,
      odds,
      locked: true,
      outcomeId,
      sourceSelectionId: `id1000001772221406:1xbet:${outcomeId}:0`,
    })),
  };
}

export function MarketSemanticsCheck() {
  const match = {
    id: 'oddspapi-v5:id1000001772221406',
    sport: 'football',
    team1: 'Manchester City',
    team2: 'Fulham FC',
    league: 'Premier League',
    marketGroups: groups,
  } as MatchEvent;
  return (
    <div className="mx-auto min-h-screen max-w-[720px] bg-[#f0f2f5] dark:bg-gray-900">
      <header className="px-4 py-3">
        <p className="text-xs font-semibold text-gray-500">Premier League</p>
        <h1 className="text-lg font-bold text-[#1A1A1A] dark:text-white">Manchester City — Fulham FC</h1>
      </header>
      <OddsPapiMarketBoard match={match} />
    </div>
  );
}
