import type { BetSelection, MarketGroup, MatchEvent } from '../types';

export function isTwoWaySport(sport: string): boolean {
  return ['basketball', 'tennis', 'volleyball', 'esports'].includes(sport.toLowerCase());
}

export function mainOutcomeButtons(match: MatchEvent): Array<{ key: string; odds: number }> {
  if (isTwoWaySport(match.sport) || !match.markets.x) {
    return [
      { key: 'П1', odds: match.markets['1'] },
      { key: 'П2', odds: match.markets['2'] },
    ].filter((item) => item.odds > 0);
  }
  return [
    { key: 'П1', odds: match.markets['1'] },
    { key: 'X', odds: match.markets.x },
    { key: 'П2', odds: match.markets['2'] },
  ].filter((item) => item.odds > 0);
}

export function extraMarketRows(
  match: MatchEvent,
): Array<{ name: string; outcomes: Array<{ label: string; odds: number }> }> {
  const groups = match.marketGroups ?? [];
  const pick = (test: (group: MarketGroup) => boolean) => {
    const group = groups.find(test);
    if (!group) return null;
    const outcomes = group.outcomes.filter((row) => row.odds > 0).slice(0, 2);
    return outcomes.length ? { name: group.name, outcomes } : null;
  };
  return [
    pick((group) => group.category === 'totals' || /тотал/i.test(group.name)),
    pick((group) => group.category === 'handicaps' || /фора/i.test(group.name)),
  ].filter((row): row is NonNullable<typeof row> => Boolean(row));
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
