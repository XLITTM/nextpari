import type { ExtraMarket, NormalizedOdds } from './betsapi';
import type { MarketCategory, MarketGroup, MarketOutcome } from '../types';

const PRIORITY_TITLES = ['1X2', 'Победитель', 'Двойной шанс', 'Тотал', 'Фора', 'Обе забьют'] as const;

function categoryOf(name: string): MarketCategory {
  const value = name.toLowerCase();
  if (/1-й тайм|1st.?half|half time/i.test(value)) return '1st-half';
  if (/2-й тайм|2nd.?half/i.test(value)) return '2nd-half';
  if (/четверт|период|сет|quarter|set\b|interval/i.test(value)) return 'intervals';
  if (/угл|corner/i.test(value)) return 'corners';
  if (/карт|card|yellow|red card/i.test(value)) return 'cards';
  if (/фол|foul/i.test(value)) return 'fouls';
  if (/удар|shot/i.test(value)) return 'shots';
  if (/офсайд|offside/i.test(value)) return 'offsides';
  if (/игрок|player|scorer|стрелок/i.test(value)) return 'players';
  if (/стат|stat/i.test(value)) return 'statistics';
  if (/аут|throw-in/i.test(value)) return 'throw-ins';
  if (/точн|correct score|комбо|combo/i.test(value)) return 'combo';
  if (/тотал|total|over|under|гол|goal line/i.test(value)) return 'totals';
  if (/фора|handicap|spread/i.test(value)) return 'handicaps';
  return 'main';
}

function layoutOf(outcomes: MarketOutcome[]): MarketGroup['layout'] {
  if (outcomes.length > 6) return 'table';
  if (outcomes.length === 2) return 'grid';
  return 'grid';
}

function toGroup(id: string, name: string, outcomes: MarketOutcome[]): MarketGroup | null {
  const valid = outcomes.filter((row) => row.odds > 0 && row.label);
  if (!valid.length) return null;
  return { id, name, category: categoryOf(name), layout: layoutOf(valid), outcomes: valid };
}

export function orderPriorityMarkets(groups: MarketGroup[]): MarketGroup[] {
  const leftover = [...groups];
  const ordered: MarketGroup[] = [];
  for (const title of PRIORITY_TITLES) {
    const index = leftover.findIndex((group) => group.name.trim().toLowerCase() === title.toLowerCase());
    if (index < 0) continue;
    ordered.push(...leftover.splice(index, 1));
  }
  leftover.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return [...ordered, ...leftover];
}

export function groupsFromLiveOdds(odds: NormalizedOdds, extra: ExtraMarket[], sport: string): MarketGroup[] {
  const twoWay = ['basketball', 'tennis', 'volleyball', 'esports'].includes(sport);
  const groups: MarketGroup[] = [];
  const seen = new Set<string>();

  const push = (group: MarketGroup | null) => {
    if (!group || seen.has(group.name)) return;
    seen.add(group.name);
    groups.push(group);
  };

  for (const market of extra) {
    push(
      toGroup(
        `live-${market.name}`,
        market.name,
        Object.entries(market.outcomes).map(([label, value]) => ({ label, odds: value })),
      ),
    );
  }

  const main: MarketOutcome[] = [];
  if (odds.p1 > 0) main.push({ label: 'П1', odds: odds.p1 });
  if (!twoWay && odds.x > 0) main.push({ label: 'Ничья', odds: odds.x });
  if (odds.p2 > 0) main.push({ label: 'П2', odds: odds.p2 });
  if (main.length) push(toGroup('live-1x2', twoWay ? 'Победитель' : '1X2', main));

  if (odds.tb25 > 0 || odds.tm25 > 0) {
    const line = odds.totalLine && odds.totalLine > 0 ? odds.totalLine : 2.5;
    push(
      toGroup('live-totals', 'Тотал', [
        ...(odds.tb25 > 0 ? [{ label: `ТБ ${line}`, odds: odds.tb25 }] : []),
        ...(odds.tm25 > 0 ? [{ label: `ТМ ${line}`, odds: odds.tm25 }] : []),
      ]),
    );
  }

  if (odds.handicapHome && odds.handicapAway) {
    const line = odds.handicapLine ?? 0;
    const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
    push(
      toGroup('live-handicap', 'Фора', [
        { label: `Ф1 (${signed(line)})`, odds: odds.handicapHome },
        { label: `Ф2 (${signed(-line)})`, odds: odds.handicapAway },
      ]),
    );
  }

  return orderPriorityMarkets(groups);
}
