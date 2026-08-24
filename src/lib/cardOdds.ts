import type { BetSelection, MarketGroup, MatchEvent } from '../types';

export function isTwoWaySport(sport: string): boolean {
  return ['basketball', 'tennis', 'volleyball', 'esports'].includes(sport.toLowerCase());
}

export interface CardOutcomeButton {
  key: string;
  odds: number;
  locked: boolean;
}

export function mainOutcomeButtons(match: MatchEvent): CardOutcomeButton[] {
  return [
    { key: 'П1', odds: match.markets['1'] > 1 ? match.markets['1'] : 2.1, locked: false },
    { key: 'X', odds: match.markets.x > 1 ? match.markets.x : 3.25, locked: false },
    { key: 'П2', odds: match.markets['2'] > 1 ? match.markets['2'] : 2.8, locked: false },
  ];
}

export function extraMarketRows(
  match: MatchEvent,
): Array<{ name: string; outcomes: Array<{ label: string; odds: number }> }> {
  const groups = match.marketGroups ?? [];
  const pick = (test: (group: MarketGroup) => boolean, limit = 2) => {
    const group = groups.find(test);
    if (!group) return null;
    const outcomes = group.outcomes.filter((row) => row.odds > 0).slice(0, limit);
    return outcomes.length ? { name: group.name, outcomes } : null;
  };
  const totals = groups
    .filter((group) => group.category === 'totals' || /тотал/i.test(group.name))
    .slice(0, 3)
    .map((group) => ({
      name: group.name,
      outcomes: group.outcomes.filter((row) => row.odds > 0).slice(0, 2),
    }))
    .filter((row) => row.outcomes.length);
  const handicap = pick((group) => group.category === 'handicaps' || /фора/i.test(group.name));
  const dc = pick((group) => /двойной шанс/i.test(group.name), 3);
  const btts = pick((group) => /обе забьют|btts/i.test(group.name));
  return [...totals, handicap, dc, btts].filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export function buildCardSelection(
  match: MatchEvent,
  outcome: string,
  odds: number,
  market: string,
): BetSelection {
  return {
    id: `${match.id}-${market}-${outcome}`,
    matchId: match.id,
    matchLabel: `${match.team1} — ${match.team2}`,
    market,
    outcome,
    odds,
    homeTeam: match.team1,
    awayTeam: match.team2,
    sport: match.sport,
    country: match.country,
    league: match.league,
    isLive: match.isLive,
    startTime: match.startTime,
    liveStatus: match.liveStatus,
  };
}
